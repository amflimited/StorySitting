#!/usr/bin/env python3
"""Reconcile StorySitting's file-backed concierge orders with Stripe.

This is the recovery path when a buyer closes Stripe before returning to the
site.  It also delivers the sponsor's private project link and Family Pass,
alerts the operator about storyteller responses, and records refunds/disputes.
It never starts a call and never creates an edition charge.
"""

from __future__ import annotations

import base64
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


BASE_DIR = Path(os.environ.get("SS_BASE_DIR", "/opt/storysitting"))
ORDERS_DIR = BASE_DIR / "orders-v2"
KEY_FILE = Path(os.environ.get("SS_STRIPE_KEY_FILE", "/etc/onesmallprompt/stripe_secret"))
SITE_URL = os.environ.get("SS_SITE_URL", "https://storysitting.com").rstrip("/")
STRIPE_API = "https://api.stripe.com/v1"
RMAIL = "/usr/local/bin/rmail"
OWNER_TO = "adam@onesmallprompt.com"
SENDAS_FILE = Path("/etc/gmail-rail-sendas")
FALLBACK_ADDR = "hello@revenuepack.com"
PREFERRED_ADDR = "hello@storysitting.com"
ABANDON_GRACE = 30 * 60
ABANDON_MAX_AGE = 7 * 24 * 60 * 60
DRY = "--dry" in sys.argv

RESULT_OFFERS = {
    "voice": {"rank": 1, "name": "Voice Edition", "price_cents": 3900,
              "required": {"preview_audio", "full_recording", "transcript", "permission_record"}},
    "story": {"rank": 2, "name": "Story Edition", "price_cents": 7900,
              "required": {"preview_audio", "full_recording", "transcript", "chapter", "archive", "permission_record"}},
    "heirloom": {"rank": 3, "name": "Heirloom Edition", "price_cents": 14900,
                 "required": {"preview_audio", "full_recording", "transcript", "chapter", "archive", "permission_record", "heirloom_pdf"}},
}


def _verified() -> set[str]:
    try:
        return {line.strip().lower() for line in SENDAS_FILE.read_text(encoding="utf-8").splitlines() if line.strip()}
    except OSError:
        return set()


def _identity(display: str) -> str:
    address = PREFERRED_ADDR if PREFERRED_ADDR in _verified() else FALLBACK_ADDR
    return f"{display} <{address}>"


ALERT_FROM = _identity("StorySitting")
BUYER_FROM = _identity("Adam at StorySitting")


def _key() -> str:
    return KEY_FILE.read_text(encoding="utf-8").strip()


def stripe_get(path: str) -> tuple[bool, dict]:
    request = urllib.request.Request(f"{STRIPE_API}{path}", method="GET")
    auth = base64.b64encode(f"{_key()}:").decode()
    request.add_header("Authorization", f"Basic {auth}")
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return True, json.loads(response.read().decode())
    except urllib.error.HTTPError as error:
        try:
            return False, json.loads(error.read().decode())
        except Exception:
            return False, {"error": {"message": "Stripe returned an HTTP error."}}
    except Exception as error:
        return False, {"error": {"message": str(error)}}


def stripe_post(path: str, params: dict, *, idempotency_key: str) -> tuple[bool, dict]:
    data = urllib.parse.urlencode(params).encode()
    request = urllib.request.Request(f"{STRIPE_API}{path}", data=data, method="POST")
    auth = base64.b64encode(f"{_key()}:").decode()
    request.add_header("Authorization", f"Basic {auth}")
    request.add_header("Content-Type", "application/x-www-form-urlencoded")
    request.add_header("Idempotency-Key", idempotency_key[:255])
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return True, json.loads(response.read().decode())
    except urllib.error.HTTPError as error:
        try:
            return False, json.loads(error.read().decode())
        except Exception:
            return False, {"error": {"message": "Stripe returned an HTTP error."}}
    except Exception as error:
        return False, {"error": {"message": str(error)}}


def load_orders() -> list[dict]:
    orders: list[dict] = []
    for path in sorted(ORDERS_DIR.glob("ss_*.json")):
        try:
            orders.append(json.loads(path.read_text(encoding="utf-8")))
        except (OSError, json.JSONDecodeError) as error:
            print(f"WARN unreadable order {path.name}: {error}")
    return orders


def save(order: dict) -> None:
    if DRY:
        return
    path = ORDERS_DIR / f"{order['order_id']}.json"
    temporary = path.with_suffix(".json.reconcile.tmp")
    order["updated_at"] = int(time.time())
    with temporary.open("w", encoding="utf-8") as output:
        json.dump(order, output, indent=2, sort_keys=True)
        output.flush()
        os.fsync(output.fileno())
    temporary.chmod(0o600)
    os.replace(temporary, path)


def mail(sender: str, recipient: str, subject: str, body: str, category: str) -> bool:
    if DRY:
        print(f"  [dry] mail to={recipient} subject={subject!r}")
        return True
    environment = dict(os.environ)
    environment["RMAIL_CATEGORY"] = category
    try:
        subprocess.run([RMAIL, sender, recipient, subject], input=body, text=True,
                       check=True, timeout=30, env=environment)
        return True
    except Exception as error:
        print(f"  MAIL FAILED (will retry): {error}")
        return False


def _start_session_id(order: dict) -> str | None:
    return order.get("start_checkout_session") or order.get("session_id")


def _payment_intent_id(value) -> str | None:
    if isinstance(value, dict):
        return value.get("id")
    return value if isinstance(value, str) else None


def _manifest_kinds(order: dict) -> set[str]:
    return {
        str(entry.get("kind")) for entry in (order.get("result_manifest") or {}).get("files", [])
        if isinstance(entry, dict) and entry.get("kind")
    }


def _offer_ready(order: dict, offer_id: str) -> bool:
    offer = RESULT_OFFERS.get(offer_id)
    return bool(order.get("result_manifest_ready") and offer and offer["required"] <= _manifest_kinds(order))


def _refresh_result_entitlement(order: dict) -> str | None:
    payments = [payment for payment in order.get("result_payments", []) if payment.get("status") == "paid"]
    paid_total = sum(max(0, int(payment.get("amount_cents", 0))) for payment in payments)
    if not payments and order.get("result_payment_status") == "paid" and not order.get("result_payment_revoked_at"):
        paid_total = 7900
    eligible = [
        offer_id for offer_id, offer in RESULT_OFFERS.items()
        if int(offer["price_cents"]) <= paid_total and _offer_ready(order, offer_id)
    ]
    offer_id = max(eligible, key=lambda item: int(RESULT_OFFERS[item]["rank"])) if eligible else None
    order["result_paid_total_cents"] = paid_total
    if offer_id:
        order["result_offer_id"] = offer_id
        order["result_payment_status"] = "paid"
        order["status"] = "result_kept"
    else:
        order.pop("result_offer_id", None)
        if order.get("result_payments"):
            order["result_payment_status"] = "revoked"
        if order.get("status") == "result_kept":
            order["status"] = "preview_ready"
    return offer_id


def reconcile_start_payment(order: dict) -> tuple[bool, str | None]:
    session_id = _start_session_id(order)
    if not session_id or order.get("start_payment_status") == "paid":
        return False, None
    ok, session = stripe_get(f"/checkout/sessions/{urllib.parse.quote(session_id)}?expand[]=payment_intent")
    if not ok:
        return False, session.get("error", {}).get("message", "Stripe lookup failed")
    metadata = session.get("metadata") or {}
    if metadata.get("order_id") != order["order_id"]:
        return False, "Checkout metadata does not match the order"
    if session.get("payment_status") != "paid":
        return False, None
    payment_intent = session.get("payment_intent")
    order["start_payment_status"] = "paid"
    order["start_payment_intent"] = _payment_intent_id(payment_intent)
    order.setdefault("paid_at", int(time.time()))
    if order.get("status") in {"awaiting_payment", "started", "checkout_error"}:
        order["status"] = "permission_pending"
    order.setdefault("permission_status", "waiting_for_storyteller")
    order["reconciled_by"] = "ss-reconcile-v4"
    return True, None


def reconcile_result_payment(order: dict) -> tuple[bool, str | None]:
    attempts = [attempt for attempt in order.get("result_checkout_attempts", []) if isinstance(attempt, dict)]
    if not attempts and order.get("result_checkout_session") and order.get("result_payment_status") != "paid":
        attempts = [{
            "attempt_id": "legacy-v3",
            "offer_id": "story",
            "amount_cents": 7900,
            "stripe_checkout_session": order["result_checkout_session"],
            "status": "open",
        }]
    changed = False
    warnings: list[str] = []
    payments = order.setdefault("result_payments", [])
    for attempt in attempts:
        session_id = str(attempt.get("stripe_checkout_session") or "")
        if not session_id or attempt.get("status") in {"paid", "refunded", "disputed"}:
            continue
        ok, session = stripe_get(f"/checkout/sessions/{urllib.parse.quote(session_id)}?expand[]=payment_intent")
        if not ok:
            warnings.append(session.get("error", {}).get("message", "Stripe lookup failed"))
            continue
        metadata = session.get("metadata") or {}
        offer_id = str(attempt.get("offer_id") or "")
        amount_cents = int(attempt.get("amount_cents", 0))
        attempt_id = str(attempt.get("attempt_id") or "")
        matches = (
            metadata.get("order_id") == order["order_id"]
            and metadata.get("kind") == "finished_result"
            and (attempt_id == "legacy-v3" or metadata.get("attempt_id") == attempt_id)
            and (attempt_id == "legacy-v3" or metadata.get("offer_id") == offer_id)
            and (attempt_id == "legacy-v3" or metadata.get("amount_cents") == str(amount_cents))
            and (session.get("amount_total") is None or int(session.get("amount_total")) == amount_cents)
        )
        if not matches:
            warnings.append(f"Result Checkout {session_id} metadata or amount does not match")
            continue
        if session.get("payment_status") != "paid":
            if session.get("status") == "expired" and attempt.get("status") != "expired":
                attempt["status"] = "expired"
                attempt["closed_at"] = int(time.time())
                changed = True
            continue
        if not _offer_ready(order, offer_id):
            order["result_payment_requires_review"] = True
            changed = True
            warnings.append(f"{offer_id} payment arrived before delivery verification")
            continue
        if not any(payment.get("stripe_checkout_session") == session_id for payment in payments):
            payment_intent = _payment_intent_id(session.get("payment_intent"))
            current_paid = sum(
                max(0, int(payment.get("amount_cents", 0)))
                for payment in payments if payment.get("status") == "paid"
            )
            expected_from = int(attempt.get("from_paid_cents", 0))
            expected_due = int(RESULT_OFFERS.get(offer_id, {}).get("price_cents", 0)) - current_paid
            stale_attempt = attempt_id != "legacy-v3" and (
                current_paid != expected_from or amount_cents != expected_due or expected_due <= 0
            )
            if stale_attempt:
                refunded = False
                refund_error = "No PaymentIntent was attached to the stale Checkout"
                if payment_intent and not DRY:
                    refunded, refund = stripe_post(
                        "/refunds",
                        {
                            "payment_intent": payment_intent,
                            "reason": "duplicate",
                            "metadata[order_id]": order["order_id"],
                            "metadata[attempt_id]": attempt_id,
                            "metadata[reason]": "stale_result_edition_attempt",
                        },
                        idempotency_key=f"ss-result-stale-refund-{session_id}",
                    )
                    refund_error = refund.get("error", {}).get("message", "Stripe refund failed")
                payments.append({
                    "stripe_checkout_session": session_id,
                    "stripe_payment_intent": payment_intent,
                    "attempt_id": attempt_id,
                    "offer_id": offer_id,
                    "amount_cents": amount_cents,
                    "status": "refunded" if refunded else "refund_required",
                    "paid_at": int(time.time()),
                    "revoked_at": int(time.time()) if refunded else None,
                })
                attempt["status"] = "refunded" if refunded else "refund_required"
                attempt["stripe_payment_intent"] = payment_intent
                order["result_payment_requires_review"] = not refunded
                changed = True
                if not refunded:
                    warnings.append(f"Stale edition payment {session_id} requires refund: {refund_error}")
                continue
            payments.append({
                "stripe_checkout_session": session_id,
                "stripe_payment_intent": payment_intent,
                "attempt_id": attempt_id,
                "offer_id": offer_id,
                "amount_cents": amount_cents,
                "status": "paid",
                "paid_at": int(time.time()),
            })
            attempt["status"] = "paid"
            attempt["paid_at"] = int(time.time())
            attempt["stripe_payment_intent"] = payment_intent
            order["result_payment_intent"] = payment_intent
            order.setdefault("result_paid_at", int(time.time()))
            changed = True
    before = (order.get("result_offer_id"), order.get("result_paid_total_cents"), order.get("status"))
    _refresh_result_entitlement(order)
    changed |= before != (order.get("result_offer_id"), order.get("result_paid_total_cents"), order.get("status"))
    if changed:
        order.pop("result_checkout_url", None)
    return changed, "; ".join(warnings) if warnings else None


def reconcile_revocation(order: dict, field: str, *, result: bool = False) -> tuple[bool, str | None]:
    payment_intent = order.get(field)
    if not payment_intent:
        return False, None
    marker = "result_revocation_checked_at" if result else "start_revocation_checked_at"
    if int(time.time()) - int(order.get(marker, 0)) < 15 * 60:
        return False, None
    ok, intent = stripe_get(f"/payment_intents/{urllib.parse.quote(payment_intent)}?expand[]=latest_charge")
    if not ok:
        return False, intent.get("error", {}).get("message", "PaymentIntent lookup failed")
    order[marker] = int(time.time())
    charge = intent.get("latest_charge") or {}
    revoked = intent.get("status") == "canceled" or bool(charge.get("refunded")) or bool(charge.get("disputed"))
    if not revoked:
        return True, None
    now = int(time.time())
    if result:
        order.setdefault("result_payment_revoked_at", now)
        order["result_payment_status"] = "revoked"
        if order.get("status") == "result_kept":
            order["status"] = "preview_ready"
    else:
        order.setdefault("payment_revoked_at", now)
        order["start_payment_status"] = "revoked"
        order["status"] = "payment_revoked"
    return True, "Payment was refunded, canceled, or disputed"


def reconcile_result_revocations(order: dict) -> tuple[bool, str | None]:
    payments = [payment for payment in order.get("result_payments", []) if isinstance(payment, dict)]
    if not payments:
        return reconcile_revocation(order, "result_payment_intent", result=True)
    changed = False
    warnings: list[str] = []
    now = int(time.time())
    for payment in payments:
        payment_intent = str(payment.get("stripe_payment_intent") or "")
        if not payment_intent or payment.get("status") != "paid":
            continue
        if now - int(payment.get("revocation_checked_at", 0)) < 15 * 60:
            continue
        ok, intent = stripe_get(f"/payment_intents/{urllib.parse.quote(payment_intent)}?expand[]=latest_charge")
        if not ok:
            warnings.append(intent.get("error", {}).get("message", "PaymentIntent lookup failed"))
            continue
        payment["revocation_checked_at"] = now
        changed = True
        charge = intent.get("latest_charge") or {}
        refunded = bool(charge.get("refunded"))
        disputed = bool(charge.get("disputed"))
        canceled = intent.get("status") == "canceled"
        if not (refunded or disputed or canceled):
            continue
        payment["status"] = "disputed" if disputed else "revoked"
        payment["revoked_at"] = now
        payment["revocation_reason"] = "disputed" if disputed else ("refunded" if refunded else "canceled")
        for attempt in order.get("result_checkout_attempts", []):
            if attempt.get("attempt_id") == payment.get("attempt_id"):
                attempt["status"] = payment["status"]
    before = (order.get("result_offer_id"), order.get("result_paid_total_cents"), order.get("status"))
    _refresh_result_entitlement(order)
    changed |= before != (order.get("result_offer_id"), order.get("result_paid_total_cents"), order.get("status"))
    return changed, "; ".join(warnings) if warnings else None


def buyer_started_email(order: dict) -> bool:
    intake = order.get("intake", {})
    first_name = (intake.get("buyer_name") or "there").split()[0]
    subject = intake.get("subject_name") or "your storyteller"
    project_url = f"{SITE_URL}/story/{order['sponsor_token']}"
    pass_url = f"{SITE_URL}/permission/{order['permission_token']}"
    body = f"""Hi {first_name},

Your $5 Story Start for {subject} is paid.

There is one next move: send {subject} the private Family Pass below.

FAMILY PASS
{pass_url}

The pass lets them say interested, no, or never call. An interested response
does not schedule an AI interview. A real person must verify identity and the
contact boundary first. Recording and transcription still need separate spoken
permission at the sitting.

YOUR PRIVATE PROJECT PAGE
{project_url}

That page always answers who has the next move and what happens after it. Keep
the link private.

The $5 is the complete charge today. There is no subscription and no automatic
result charge. After an authorized sitting and a real private preview, you may
choose the $39 Voice Edition, $79 Story Edition, or $149 Heirloom Edition. You
can upgrade later by paying only the difference.

— Adam
StorySitting · AMF LLC · Wilkinson, Indiana

Story Start: {order['order_id']}
"""
    return mail(BUYER_FROM, intake.get("buyer_email", ""),
                f"Your next step for {subject}: share their Family Pass", body, "customer")


def owner_started_email(order: dict) -> bool:
    intake = order.get("intake", {})
    body = f"""A $5 Story Start is paid.

Order: {order['order_id']}
Sponsor: {intake.get('buyer_name')} <{intake.get('buyer_email')}>
Storyteller: {intake.get('subject_name')}
Relationship: {intake.get('relationship')}
Best times: {intake.get('best_times')}
Capture: {intake.get('capture')}
Story shape: {intake.get('story_shape', 'open')}
Artifact layer: {intake.get('artifact_note', '')}
Other family context: {intake.get('family_context', '')}

No outbound AI call is authorized. The sponsor has a Family Pass to share. Wait
for a storyteller response, then complete a direct human identity/contact check
before scheduling anything. Never create an edition charge from this event.
"""
    return mail(ALERT_FROM, OWNER_TO,
                f"PAID $5 — Story Start from {intake.get('buyer_name')}", body, "owner")


def permission_response_emails(order: dict, *, send_owner: bool, send_buyer: bool) -> tuple[bool, bool]:
    intake = order.get("intake", {})
    interested = order.get("permission_status") == "identity_pending"
    owner_body = f"""Family Pass response for {order['order_id']}.

Storyteller: {intake.get('subject_name')}
Response: {'INTERESTED — UNVERIFIED' if interested else 'DECLINED'}
Preferred human-check time/accommodation: {order.get('human_check_preference', '')}
Storyteller note: {order.get('storyteller_note', '')}
Permanent DNC: {bool(order.get('do_not_call_recorded_at'))}

{'Complete a direct human identity check. Do not schedule AI contact from the web response alone.' if interested else 'Close the project. Do not schedule an interview.'}
"""
    owner_ok = True
    if send_owner:
        owner_ok = mail(ALERT_FROM, OWNER_TO,
                        f"Family Pass: {'human check needed' if interested else 'declined'} — {intake.get('subject_name')}",
                        owner_body, "owner")
    buyer_body = (
        f"{intake.get('subject_name')} responded to the Family Pass. A real person now completes the identity and contact check. No AI interview was scheduled by the link, and there is no new charge.\n\nTrack the project here:\n{SITE_URL}/story/{order['sponsor_token']}\n"
        if interested else
        f"{intake.get('subject_name')} chose not to continue with this Story Start. We respect that choice; no interview will be scheduled and no result edition will be offered.\n\nYour private project page:\n{SITE_URL}/story/{order['sponsor_token']}\n"
    )
    buyer_ok = True
    if send_buyer:
        buyer_ok = mail(BUYER_FROM, intake.get("buyer_email", ""),
                        f"{intake.get('subject_name')} responded to their Family Pass", buyer_body, "customer")
    return owner_ok, buyer_ok


def result_kept_email(order: dict) -> bool:
    intake = order.get("intake", {})
    offer_id = order.get("result_offer_id") or "story"
    offer = RESULT_OFFERS.get(offer_id, RESULT_OFFERS["story"])
    body = f"""Your {offer['name']} payment is confirmed. {intake.get('subject_name')}'s result is now kept on the private Story Shelf.

Open the project:
{SITE_URL}/story/{order['sponsor_token']}

This purchase was separate from permission and happened only after the private preview. If you later choose a larger edition, StorySitting charges only the difference.
"""
    return mail(BUYER_FROM, intake.get("buyer_email", ""),
                f"{intake.get('subject_name')}'s {offer['name']} is kept", body, "customer")


def abandoned_email(order: dict) -> bool:
    intake = order.get("intake", {})
    body = f"""A complete StorySitting intake reached Stripe but did not pay.

Order: {order['order_id']}
Sponsor: {intake.get('buyer_name')} <{intake.get('buyer_email')}>
Storyteller: {intake.get('subject_name')}

No card was charged, no Family Pass is active, and nobody should be contacted.
"""
    return mail(ALERT_FROM, OWNER_TO, f"Abandoned Story Start — {intake.get('buyer_name')}", body, "owner")


def reconcile(order: dict) -> str | None:
    changed = False
    notes: list[str] = []

    for operation in (reconcile_start_payment, reconcile_result_payment):
        did_change, warning = operation(order)
        changed |= did_change
        if warning:
            notes.append(warning)

    if order.get("start_payment_status") == "paid":
        did_change, warning = reconcile_revocation(order, "start_payment_intent", result=False)
        changed |= did_change
        if warning:
            notes.append(warning)
        did_change, warning = reconcile_result_revocations(order)
        changed |= did_change
        if warning:
            notes.append(warning)

    if order.get("start_payment_status") == "paid" and not order.get("payment_revoked_at"):
        if not order.get("alerted_paid_v3") and owner_started_email(order):
            order["alerted_paid_v3"] = int(time.time())
            changed = True
        if not order.get("buyer_confirmed_v3") and buyer_started_email(order):
            order["buyer_confirmed_v3"] = int(time.time())
            changed = True

    if order.get("permission_responded_at"):
        needs_owner = not order.get("permission_response_owner_notified_at")
        needs_buyer = not order.get("permission_response_buyer_notified_at")
        if needs_owner or needs_buyer:
            owner_ok, buyer_ok = permission_response_emails(order, send_owner=needs_owner, send_buyer=needs_buyer)
            if needs_owner and owner_ok:
                order["permission_response_owner_notified_at"] = int(time.time())
                changed = True
            if needs_buyer and buyer_ok:
                order["permission_response_buyer_notified_at"] = int(time.time())
                changed = True

    notification_key = f"result_buyer_notified_{order.get('result_offer_id', 'story')}_at"
    if order.get("result_payment_status") == "paid" and not order.get(notification_key):
        if result_kept_email(order):
            order[notification_key] = int(time.time())
            changed = True

    age = time.time() - int(order.get("created_at", 0))
    if order.get("start_payment_status", "unpaid") != "paid" and not order.get("alerted_abandoned") and ABANDON_GRACE < age < ABANDON_MAX_AGE:
        if abandoned_email(order):
            order["alerted_abandoned"] = int(time.time())
            changed = True

    if changed:
        save(order)
    if changed or notes:
        suffix = f" warnings={'; '.join(notes)}" if notes else ""
        return f"{order['order_id']}: status={order.get('status')} changed={changed}{suffix}"
    return None


def main() -> None:
    lines: list[str] = []
    for order in load_orders():
        try:
            result = reconcile(order)
        except Exception as error:
            result = f"{order.get('order_id')}: ERROR {type(error).__name__}: {error}"
        if result:
            lines.append(result)
    if lines:
        print(f"[{time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}] {len(lines)} event(s)")
        for line in lines:
            print("  " + line)


if __name__ == "__main__":
    main()
