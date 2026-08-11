#!/usr/bin/env python3
"""Guarded operator transitions for the live StorySitting concierge store.

This is deliberately a local root-only tool, not a public admin endpoint.  It
never places a provider call or charges a card.  Its job is to make the manual
human steps explicit, append evidence, and refuse unsafe state jumps.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
from pathlib import Path


BASE_DIR = Path(os.environ.get("SS_BASE_DIR", "/opt/storysitting"))
ORDERS_DIR = BASE_DIR / "orders-v2"
DELIVERIES_DIR = BASE_DIR / "deliveries-v2"


def order_path(order_id: str) -> Path:
    return ORDERS_DIR / f"{order_id}.json"


def load_order(order_id: str) -> dict:
    try:
        return json.loads(order_path(order_id).read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise SystemExit(f"No Story Start named {order_id}.")


def save_order(order: dict) -> None:
    path = order_path(order["order_id"])
    temporary = path.with_suffix(".json.operator.tmp")
    order["updated_at"] = int(time.time())
    with temporary.open("w", encoding="utf-8") as output:
        json.dump(order, output, indent=2, sort_keys=True)
        output.flush()
        os.fsync(output.fileno())
    temporary.chmod(0o600)
    os.replace(temporary, path)


def require_status(order: dict, *allowed: str) -> None:
    if order.get("status") not in allowed:
        raise SystemExit(f"Unsafe transition from {order.get('status')!r}; expected one of {allowed}.")


def audit(order: dict, event: str, evidence: dict) -> None:
    order.setdefault("operator_audit", []).append({
        "at": int(time.time()),
        "event": event,
        "operator_uid": os.getuid(),
        "evidence": evidence,
    })


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def verify_manifest(order_id: str, manifest_path: Path) -> tuple[dict, str]:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if not isinstance(manifest.get("files"), list) or not manifest["files"]:
        raise SystemExit("Manifest must contain at least one file.")
    root = (DELIVERIES_DIR / order_id).resolve()
    kinds: set[str] = set()
    allowed_kinds = {"preview_audio", "full_recording", "transcript", "chapter", "archive", "permission_record"}
    for entry in manifest["files"]:
        relative = str(entry.get("path", ""))
        kind = str(entry.get("kind", ""))
        if kind not in allowed_kinds:
            raise SystemExit(f"Unknown delivery kind for {relative}: {kind!r}")
        if kind in kinds:
            raise SystemExit(f"Duplicate delivery kind: {kind}")
        kinds.add(kind)
        candidate = (root / relative).resolve()
        if root not in candidate.parents:
            raise SystemExit(f"Manifest path escapes the order delivery directory: {relative}")
        if not candidate.is_file():
            raise SystemExit(f"Delivery file is missing: {relative}")
        expected_bytes = int(entry.get("bytes", 0))
        if expected_bytes <= 0 or candidate.stat().st_size != expected_bytes:
            raise SystemExit(f"Delivery size mismatch: {relative}")
        expected_hash = str(entry.get("sha256", "")).lower()
        if len(expected_hash) != 64 or sha256_file(candidate) != expected_hash:
            raise SystemExit(f"Delivery checksum mismatch: {relative}")
    required = allowed_kinds - kinds
    if required:
        raise SystemExit("Manifest is incomplete; missing: " + ", ".join(sorted(required)))
    normalized = json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode()
    return manifest, hashlib.sha256(normalized).hexdigest()


def command_verify(order: dict, args) -> None:
    require_status(order, "identity_pending")
    if not all((args.identity_confirmed, args.ai_contact_authorized, args.recording_boundary_explained)):
        raise SystemExit("Verification requires all three explicit attestations.")
    if len(args.call_reference.strip()) < 8 or len(args.note.strip()) < 20:
        raise SystemExit("Provide a durable call reference and a 20+ character evidence note.")
    evidence = {
        "call_reference": args.call_reference.strip(),
        "note": args.note.strip(),
        "identity_confirmed": True,
        "ai_contact_authorized": True,
        "recording_boundary_explained": True,
        "statement_version": "human_identity_2026_08_11",
    }
    order["identity_verified_at"] = int(time.time())
    order["permission_status"] = "verified_for_ai_contact"
    order["status"] = "permission_verified"
    audit(order, "identity_and_contact_verified", evidence)


def command_schedule(order: dict, args) -> None:
    require_status(order, "permission_verified", "sitting_scheduled")
    if not args.when.strip() or not args.operator_reference.strip():
        raise SystemExit("A scheduled time and operator reference are required.")
    order["sitting_scheduled_for"] = args.when.strip()
    order["status"] = "sitting_scheduled"
    audit(order, "sitting_scheduled", {"when": args.when.strip(), "operator_reference": args.operator_reference.strip()})


def command_complete(order: dict, args) -> None:
    require_status(order, "sitting_scheduled")
    if len(args.call_reference.strip()) < 8:
        raise SystemExit("A durable provider call reference is required.")
    if not all((args.ai_disclosed, args.recording_granted, args.transcription_granted, args.editing_granted)):
        raise SystemExit("Completion requires explicit AI, recording, transcription, and editing attestations.")
    order["sitting_completed_at"] = int(time.time())
    order["status"] = "sitting_complete"
    audit(order, "sitting_completed", {
        "call_reference": args.call_reference.strip(), "ai_disclosed": True,
        "recording_granted": True, "transcription_granted": True, "editing_granted": True,
        "statement_version": "sitting_scopes_2026_08_11",
    })


def command_editing(order: dict, args) -> None:
    require_status(order, "sitting_complete", "editing")
    order["status"] = "editing"
    audit(order, "editing_started", {"editor": args.editor.strip()})


def command_preview(order: dict, args) -> None:
    require_status(order, "sitting_complete", "editing")
    if not args.family_sharing_authorized or len(args.review_call_reference.strip()) < 8:
        raise SystemExit("Preview release requires direct storyteller family-sharing authorization and a review-call reference.")
    excerpt = args.excerpt_file.read_text(encoding="utf-8").strip()
    if len(excerpt) < 40:
        raise SystemExit("The private preview excerpt is too short.")
    manifest, manifest_digest = verify_manifest(order["order_id"], args.manifest)
    order["preview_title"] = args.title.strip()[:180]
    order["preview_excerpt"] = excerpt[:5000]
    order["result_manifest"] = manifest
    order["result_manifest_sha256"] = manifest_digest
    order["result_manifest_ready"] = True
    order["result_version"] = int(order.get("result_version", 0)) + 1
    order["deliverables"] = [str(entry.get("label") or entry.get("path"))[:120] for entry in manifest["files"]]
    order["preview_released_at"] = int(time.time())
    order["status"] = "preview_ready"
    audit(order, "preview_and_delivery_finalized", {
        "review_call_reference": args.review_call_reference.strip(),
        "family_sharing_authorized": True,
        "manifest_sha256": manifest_digest,
        "statement_version": "family_release_2026_08_11",
    })


def command_show(order: dict, _args) -> None:
    print(json.dumps(order, indent=2, sort_keys=True))


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description="Guarded StorySitting concierge transitions")
    root.add_argument("order_id")
    commands = root.add_subparsers(dest="command", required=True)
    commands.add_parser("show").set_defaults(handler=command_show)

    verify = commands.add_parser("verify-identity")
    verify.add_argument("--call-reference", required=True)
    verify.add_argument("--note", required=True)
    verify.add_argument("--identity-confirmed", action="store_true")
    verify.add_argument("--ai-contact-authorized", action="store_true")
    verify.add_argument("--recording-boundary-explained", action="store_true")
    verify.set_defaults(handler=command_verify)

    schedule = commands.add_parser("schedule")
    schedule.add_argument("--when", required=True)
    schedule.add_argument("--operator-reference", required=True)
    schedule.set_defaults(handler=command_schedule)

    complete = commands.add_parser("complete")
    complete.add_argument("--call-reference", required=True)
    complete.add_argument("--ai-disclosed", action="store_true")
    complete.add_argument("--recording-granted", action="store_true")
    complete.add_argument("--transcription-granted", action="store_true")
    complete.add_argument("--editing-granted", action="store_true")
    complete.set_defaults(handler=command_complete)

    editing = commands.add_parser("editing")
    editing.add_argument("--editor", required=True)
    editing.set_defaults(handler=command_editing)

    preview = commands.add_parser("preview-ready")
    preview.add_argument("--title", required=True)
    preview.add_argument("--excerpt-file", required=True, type=Path)
    preview.add_argument("--manifest", required=True, type=Path)
    preview.add_argument("--review-call-reference", required=True)
    preview.add_argument("--family-sharing-authorized", action="store_true")
    preview.set_defaults(handler=command_preview)
    return root


def main() -> None:
    args = parser().parse_args()
    order = load_order(args.order_id)
    args.handler(order, args)
    if args.command != "show":
        save_order(order)
        print(f"{order['order_id']}: status={order.get('status')}")


if __name__ == "__main__":
    main()
