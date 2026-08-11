#!/usr/bin/env python3
"""StorySitting's small production storefront and concierge journey.

This service intentionally does four things only:

* opens a $5 Story Start without saving a card for later charges;
* gives the sponsor a private project page and Family Pass;
* records the storyteller's interested / decline response without treating a
  bearer-link response as verified identity or consent to an AI interview;
* offers a separate $79 Checkout only after an operator has finalized a real
  private preview and delivery package.

The JSON order store is the current live concierge system.  Every transition is
written atomically and the Stripe Checkout Session is always bound back to the
same order before money changes product state.
"""

from __future__ import annotations

import base64
import hashlib
import html
import json
import os
import re
import secrets
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict, deque
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


BASE_DIR = Path(os.environ.get("SS_BASE_DIR", "/opt/storysitting"))
PUBLIC_DIR = BASE_DIR / "storefront" / "public"
ORDERS_DIR = BASE_DIR / "orders-v2"
IDEMPOTENCY_DIR = BASE_DIR / "idempotency-v2"
DNC_DIR = BASE_DIR / "do-not-call-v2"
PRICES_CONF = BASE_DIR / "stripe-prices.conf"
KEY_FILE = Path(os.environ.get("SS_STRIPE_KEY_FILE", "/etc/onesmallprompt/stripe_secret"))
SITE_URL = os.environ.get("SS_SITE_URL", "https://storysitting.com").rstrip("/")
PORT = int(os.environ.get("SS_PORT", "8813"))
STRIPE_API = "https://api.stripe.com/v1"
PERMISSION_TTL_SECONDS = 30 * 24 * 60 * 60
MAX_BODY_BYTES = 64 * 1024

ORDER_LOCK = threading.RLock()
RATE_LOCK = threading.Lock()
RATE_EVENTS: dict[str, deque[float]] = defaultdict(deque)

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
TOKEN_RE = re.compile(r"^[A-Za-z0-9_-]{24,96}$")
REQUIRED = (
    "buyer_name",
    "buyer_email",
    "relationship",
    "subject_name",
    "subject_phone",
    "best_times",
    "capture",
)


def _ensure_dirs() -> None:
    for path in (ORDERS_DIR, IDEMPOTENCY_DIR, DNC_DIR):
        path.mkdir(parents=True, exist_ok=True, mode=0o700)
        path.chmod(0o700)


def _load_conf(path: Path) -> dict[str, str]:
    conf: dict[str, str] = {}
    with path.open(encoding="utf-8") as source:
        for raw_line in source:
            line = raw_line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                conf[key.strip()] = value.strip()
    return conf


def _prices() -> tuple[str, str]:
    conf = _load_conf(PRICES_CONF)
    start = conf["PRICE_START"]
    result = conf.get("PRICE_RESULT") or conf["PRICE_CALL"]
    return start, result


def _stripe_key() -> str:
    return KEY_FILE.read_text(encoding="utf-8").strip()


def _encode_form(params: dict, parent: str | None = None) -> str:
    parts: list[str] = []
    for key, value in params.items():
        full = f"{parent}[{key}]" if parent else key
        if isinstance(value, dict):
            parts.append(_encode_form(value, full))
        elif isinstance(value, list):
            for index, item in enumerate(value):
                if isinstance(item, dict):
                    parts.append(_encode_form(item, f"{full}[{index}]"))
                else:
                    parts.append(urllib.parse.urlencode({f"{full}[{index}]": item}))
        elif value is not None:
            parts.append(urllib.parse.urlencode({full: value}))
    return "&".join(part for part in parts if part)


def stripe_call(
    method: str,
    path: str,
    params: dict | None = None,
    *,
    idempotency_key: str | None = None,
) -> tuple[bool, dict]:
    data = _encode_form(params).encode() if params is not None else None
    request = urllib.request.Request(f"{STRIPE_API}{path}", data=data, method=method)
    auth = base64.b64encode(f"{_stripe_key()}:").decode()
    request.add_header("Authorization", f"Basic {auth}")
    if data is not None:
        request.add_header("Content-Type", "application/x-www-form-urlencoded")
    if idempotency_key:
        request.add_header("Idempotency-Key", idempotency_key[:255])
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return True, json.loads(response.read().decode())
    except urllib.error.HTTPError as error:
        body = error.read().decode()
        try:
            return False, json.loads(body)
        except Exception:
            return False, {"error": {"message": body[:300]}}
    except Exception as error:
        return False, {"error": {"message": str(error)}}


def _truthy(value: object) -> bool:
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def normalize_phone(value: object) -> str | None:
    raw = str(value or "").strip()
    digits = re.sub(r"\D", "", raw)
    if len(digits) == 10:
        digits = "1" + digits
    if not 11 <= len(digits) <= 15:
        return None
    return "+" + digits


def validate_start(payload: dict) -> str | None:
    for field in REQUIRED:
        if not str(payload.get(field, "")).strip():
            return f"Please fill in every field (missing: {field.replace('_', ' ')})."
    if not EMAIL_RE.match(str(payload.get("buyer_email", "")).strip()):
        return "Please enter a valid email address."
    if not normalize_phone(payload.get("subject_phone")):
        return "Please enter a valid phone number for them."
    if not _truthy(payload.get("consent")):
        return "Please confirm that you are asking us to begin a permission process."
    return None


def clean_start(payload: dict) -> dict:
    intake = {field: str(payload.get(field, "")).strip()[:2000] for field in REQUIRED}
    intake["buyer_email"] = intake["buyer_email"].lower()
    intake["subject_phone_normalized"] = normalize_phone(payload.get("subject_phone"))
    intake["personal_introduction"] = str(payload.get("personal_introduction", "")).strip()[:2000]
    intake["permission_path"] = "family_pass"
    intake["permission_process_requested"] = True
    return intake


def _order_path(order_id: str) -> Path:
    if not re.fullmatch(r"ss_[a-f0-9]{18}", order_id):
        raise ValueError("invalid order id")
    return ORDERS_DIR / f"{order_id}.json"


def atomic_write(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + f".{secrets.token_hex(4)}.tmp")
    with temporary.open("w", encoding="utf-8") as output:
        json.dump(payload, output, indent=2, sort_keys=True)
        output.flush()
        os.fsync(output.fileno())
    temporary.chmod(0o600)
    os.replace(temporary, path)


def write_order(order: dict) -> None:
    order["updated_at"] = int(time.time())
    atomic_write(_order_path(order["order_id"]), order)


def read_order(order_id: str) -> dict | None:
    try:
        with _order_path(order_id).open(encoding="utf-8") as source:
            return json.load(source)
    except (FileNotFoundError, ValueError, json.JSONDecodeError):
        return None


def find_order_by(field: str, token: str) -> dict | None:
    if not TOKEN_RE.fullmatch(token):
        return None
    for path in ORDERS_DIR.glob("ss_*.json"):
        try:
            with path.open(encoding="utf-8") as source:
                order = json.load(source)
            if secrets.compare_digest(str(order.get(field, "")), token):
                return order
        except (OSError, json.JSONDecodeError):
            continue
    return None


def _idempotency_path(key: str) -> Path:
    digest = hashlib.sha256(key.encode()).hexdigest()
    return IDEMPOTENCY_DIR / f"{digest}.json"


def _load_idempotent_order(key: str) -> dict | None:
    if not key:
        return None
    try:
        record = json.loads(_idempotency_path(key).read_text(encoding="utf-8"))
        return read_order(record["order_id"])
    except (FileNotFoundError, KeyError, json.JSONDecodeError, ValueError):
        return None


def _bind_idempotency(key: str, order_id: str) -> None:
    if key:
        atomic_write(_idempotency_path(key), {"order_id": order_id, "created_at": int(time.time())})


def _dnc_path(phone: str) -> Path:
    return DNC_DIR / f"{hashlib.sha256(phone.encode()).hexdigest()}.json"


def is_do_not_call(phone: str | None) -> bool:
    return bool(phone and _dnc_path(phone).exists())


def record_do_not_call(phone: str, order_id: str, reason: str) -> None:
    atomic_write(
        _dnc_path(phone),
        {"phone_sha256": hashlib.sha256(phone.encode()).hexdigest(), "order_id": order_id,
         "reason": reason, "created_at": int(time.time())},
    )


def allow_request(key: str, limit: int, window_seconds: int) -> bool:
    now = time.time()
    with RATE_LOCK:
        events = RATE_EVENTS[key]
        while events and events[0] < now - window_seconds:
            events.popleft()
        if len(events) >= limit:
            return False
        events.append(now)
        return True


def _status_is_paid(order: dict) -> bool:
    return order.get("start_payment_status") == "paid" and not order.get("payment_revoked_at")


def handle_start(payload: dict, idempotency_key: str) -> tuple[int, dict]:
    if str(payload.get("website", "")).strip():
        return 200, {"url": SITE_URL + "/"}
    error = validate_start(payload)
    if error:
        return 400, {"error": error}
    intake = clean_start(payload)
    if is_do_not_call(intake["subject_phone_normalized"]):
        return 409, {"error": "We cannot open a Story Start for this number. No payment was taken."}

    key = str(idempotency_key or "").strip()[:200]
    with ORDER_LOCK:
        order = _load_idempotent_order(key)
        if order and order.get("start_checkout_url"):
            return 200, {"url": order["start_checkout_url"]}
        if not order:
            order_id = "ss_" + secrets.token_hex(9)
            order = {
                "order_id": order_id,
                "created_at": int(time.time()),
                "status": "awaiting_payment",
                "start_payment_status": "unpaid",
                "intake": intake,
                "sponsor_token": secrets.token_urlsafe(30),
                "permission_token": secrets.token_urlsafe(30),
                "permission_code": f"{secrets.randbelow(1_000_000):06d}",
                "permission_status": "waiting_for_storyteller",
                "amount_start_cents": 500,
            }
            write_order(order)
            _bind_idempotency(key, order_id)

        stripe_seed = hashlib.sha256((key or order["order_id"]).encode()).hexdigest()[:32]
        if not order.get("stripe_customer"):
            ok, customer = stripe_call(
                "POST",
                "/customers",
                {"email": intake["buyer_email"], "name": intake["buyer_name"],
                 "metadata": {"order_id": order["order_id"], "product": "story_start"}},
                idempotency_key=f"ss-customer-{stripe_seed}",
            )
            if not ok:
                order["checkout_error"] = customer.get("error", {}).get("message", "unknown")[:300]
                write_order(order)
                return 502, {"error": "Secure checkout could not be opened. No payment was taken."}
            order["stripe_customer"] = customer["id"]
            write_order(order)

        price_start, _ = _prices()
        ok, session = stripe_call(
            "POST",
            "/checkout/sessions",
            {
                "mode": "payment",
                "customer": order["stripe_customer"],
                "payment_method_types": ["card"],
                "line_items": [{"price": price_start, "quantity": 1}],
                "client_reference_id": order["order_id"],
                "success_url": f"{SITE_URL}/api/success?order={order['order_id']}&session_id={{CHECKOUT_SESSION_ID}}",
                "cancel_url": f"{SITE_URL}/?canceled=1#start",
                "metadata": {"order_id": order["order_id"], "kind": "story_start"},
            },
            idempotency_key=f"ss-start-session-{stripe_seed}",
        )
        if not ok:
            order["checkout_error"] = session.get("error", {}).get("message", "unknown")[:300]
            write_order(order)
            return 502, {"error": "Secure checkout could not be opened. No payment was taken."}
        order["start_checkout_session"] = session["id"]
        order["start_checkout_url"] = session["url"]
        order.pop("checkout_error", None)
        write_order(order)
        return 200, {"url": session["url"]}


def confirm_start_payment(order: dict, session_id: str) -> tuple[bool, str]:
    if not session_id or session_id != order.get("start_checkout_session"):
        return False, "That receipt does not belong to this Story Start."
    ok, session = stripe_call("GET", f"/checkout/sessions/{urllib.parse.quote(session_id)}?expand[]=payment_intent")
    if not ok:
        return False, "Payment confirmation is temporarily unavailable."
    metadata = session.get("metadata") or {}
    if metadata.get("order_id") != order["order_id"] or metadata.get("kind") != "story_start":
        return False, "That receipt does not belong to this Story Start."
    if session.get("payment_status") != "paid":
        return False, "Stripe is still confirming the payment. Refresh this page in a moment."
    if order.get("payment_revoked_at"):
        return False, "This payment is no longer active."
    payment_intent = session.get("payment_intent") or {}
    order["start_payment_status"] = "paid"
    order["start_payment_intent"] = payment_intent.get("id") if isinstance(payment_intent, dict) else payment_intent
    order.setdefault("paid_at", int(time.time()))
    if order.get("status") in {"awaiting_payment", "checkout_error"}:
        order["status"] = "permission_pending"
    order.pop("start_checkout_url", None)
    write_order(order)
    return True, "paid"


def record_permission_response(order: dict, form: dict) -> str:
    if not _status_is_paid(order):
        raise ValueError("This Story Start is not active.")
    if int(time.time()) > int(order.get("created_at", 0)) + PERMISSION_TTL_SECONDS:
        raise ValueError("This Family Pass has expired. Ask the sponsor for a new one.")
    if order.get("permission_status") not in {"waiting_for_storyteller", "identity_pending"}:
        return str(order.get("permission_status"))
    decision = str(form.get("decision", "")).strip()
    if decision not in {"interested", "decline", "never_call"}:
        raise ValueError("Please choose one response.")
    now = int(time.time())
    order["permission_responded_at"] = now
    order["storyteller_display_name"] = str(form.get("storyteller_name", "")).strip()[:120]
    order["storyteller_note"] = str(form.get("storyteller_note", "")).strip()[:1000]
    if decision == "interested":
        order["permission_status"] = "identity_pending"
        order["status"] = "identity_pending"
        order["human_check_preference"] = str(form.get("human_check_preference", "")).strip()[:240]
        order["permission_response"] = "interested_unverified"
    else:
        order["permission_status"] = "declined"
        order["permission_response"] = "declined"
        order["status"] = "permission_declined"
        if decision == "never_call":
            phone = order.get("intake", {}).get("subject_phone_normalized")
            if phone:
                record_do_not_call(phone, order["order_id"], "storyteller_family_pass_request")
                order["do_not_call_recorded_at"] = now
    write_order(order)
    return decision


FLOW = (
    ("Story Start", "The sponsor opened one project for $5."),
    ("Their response", "The storyteller answers the Family Pass privately."),
    ("Human verification", "A human confirms identity and the AI-contact boundary."),
    ("The sitting", "Only an authorized call can be scheduled."),
    ("Private preview", "The strongest finished passage arrives before another purchase."),
    ("Keep the result", "$79 is a separate, deliberate decision."),
)

STATUS_PROGRESS = {
    "permission_pending": 1,
    "identity_pending": 2,
    "permission_verified": 3,
    "sitting_scheduled": 3,
    "sitting_complete": 4,
    "editing": 4,
    "preview_ready": 5,
    "result_checkout_pending": 5,
    "result_kept": 6,
}


def _timeline(order: dict) -> str:
    status = order.get("status", "permission_pending")
    progress = STATUS_PROGRESS.get(status, 1)
    rows: list[str] = []
    for index, (title, copy) in enumerate(FLOW):
        if status == "permission_declined" and index > 1:
            state, label = "", "Stopped"
        elif index < progress:
            state, label = "done", "Complete"
        elif index == progress:
            state, label = "current", "Now"
        else:
            state, label = "", "Later"
        rows.append(
            f'<li class="{state}"><span class="number">{index + 1:02d}</span>'
            f'<div><strong>{html.escape(title)}</strong><p>{html.escape(copy)}</p></div>'
            f'<span class="state">{label}</span></li>'
        )
    return "".join(rows)


def _next_action(order: dict) -> tuple[str, str, str]:
    status = order.get("status")
    subject_raw = str(order.get("intake", {}).get("subject_name") or "your storyteller")
    subject = html.escape(subject_raw)
    if status == "permission_pending":
        pass_url = f"{SITE_URL}/permission/{order['permission_token']}"
        body = (
            f"<p>Send this private Family Pass to {subject}. It lets them say interested, no, or never call. "
            "An interested response still does <strong>not</strong> schedule an AI call; a human verifies identity first.</p>"
            f'<div class="pass-box"><small>Private Family Pass</small><code id="family-pass">{html.escape(pass_url)}</code></div>'
            '<div class="button-row"><button class="process-button" type="button" data-share-pass '
            f'data-share-url="{html.escape(pass_url, quote=True)}" data-share-name="{html.escape(subject_raw, quote=True)}">Share Family Pass</button>'
            '<button class="process-button secondary" type="button" data-copy="#family-pass">Copy link</button></div>'
            '<p class="copy-status" aria-live="polite"></p>'
        )
        return "Waiting on you", "Share one private pass.", body
    if status == "identity_pending":
        return (
            f"Waiting on {subject}",
            "A human check comes before any AI call.",
            "<p>We received an interested response. StorySitting now verifies that it came from the storyteller and confirms the contact boundary directly. Nothing is scheduled from the link alone.</p>",
        )
    if status == "permission_declined":
        never = " Their number was also placed on the do-not-call list." if order.get("do_not_call_recorded_at") else ""
        return "Closed with respect", "They chose not to continue.", f"<p>No interview will be scheduled for this Story Start.{never} The $79 decision never appears.</p>"
    if status in {"permission_verified", "sitting_scheduled"}:
        return "StorySitting has it", "The authorized sitting is being arranged.", "<p>Identity and contact permission are verified. The storyteller will still hear the AI and recording disclosures at the sitting and can stop at any time.</p>"
    if status in {"sitting_complete", "editing"}:
        return "StorySitting is working", "The source is becoming a private preview.", "<p>The sitting is complete. We are checking the transcript, shaping the chapter, linking source passages, and preparing the strongest preview.</p>"
    if status == "preview_ready":
        excerpt = html.escape(str(order.get("preview_excerpt") or "Your private preview is ready."))
        title = html.escape(str(order.get("preview_title") or "A finished passage"))
        body = (
            f'<div class="permission-note"><small>Private preview</small><p><strong>{title}</strong><br>{excerpt}</p></div>'
            "<p>The $79 keeps the complete recording, readable transcript, source-linked chapter, portable package, and one factual correction pass. It is not automatic.</p>"
            f'<form method="post" action="/api/result/start"><input type="hidden" name="sponsor_token" value="{html.escape(order["sponsor_token"], quote=True)}">'
            '<button class="process-button" type="submit">Keep the finished result · $79</button></form>'
        )
        return "Waiting on you", "Hear it first. Decide now—or later.", body
    if status == "result_checkout_pending":
        body = (
            "<p>Stripe has not confirmed the optional $79 purchase yet. No entitlement changes until payment is confirmed.</p>"
            f'<form method="post" action="/api/result/start"><input type="hidden" name="sponsor_token" value="{html.escape(order["sponsor_token"], quote=True)}">'
            '<button class="process-button" type="submit">Return to secure checkout</button></form>'
        )
        return "Waiting on payment", "The finished result is still private.", body
    if status == "result_kept":
        files = order.get("deliverables") or ["Full recording", "Readable transcript", "Source-linked chapter", "Permission record"]
        items = "".join(f"<li>{html.escape(str(item))}</li>" for item in files)
        return "On the Story Shelf", "The finished result belongs to the family.", f"<p>The result is kept. Your portable package includes:</p><ul>{items}</ul><div class=\"button-row\"><a class=\"process-button\" href=\"/#start\">Start another sitting · $5</a></div>"
    return "StorySitting is checking", "Your project is safe.", "<p>We are checking the next step. No new charge or call will happen automatically.</p>"


def page(title: str, body: str, *, description: str = "Private StorySitting project") -> str:
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(title)} — StorySitting</title><meta name="description" content="{html.escape(description, quote=True)}">
<meta name="robots" content="noindex,nofollow,noarchive"><link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/fonts/fonts.css"><link rel="stylesheet" href="/fonts/fonts-prose.css">
<link rel="stylesheet" href="/assets/process-v2.css?v=20260811a"><script src="/assets/process-v2.js?v=20260811a" defer></script>
</head><body><header class="process-header"><a class="process-brand" href="/">StorySitting</a><span>The storyteller controls the story.</span></header>{body}</body></html>'''


def project_page(order: dict, *, welcome: bool = False) -> str:
    intake = order.get("intake", {})
    subject_raw = str(intake.get("subject_name") or "Your storyteller")
    subject = html.escape(subject_raw)
    relationship = html.escape(intake.get("relationship") or "family")
    label, heading, action = _next_action(order)
    paid = time.strftime("%b %d, %Y", time.gmtime(order.get("paid_at", order.get("created_at", 0))))
    welcome_note = '<p class="process-eyebrow">Payment confirmed · your next action is below</p>' if welcome else '<p class="process-eyebrow">Private project page</p>'
    body = f'''<main class="process-shell">
      <section class="process-hero"><div>{welcome_note}<h1>{subject}'s first story.</h1></div>
      <p class="process-lede">One continuous path from the $5 beginning to a result you can hear before deciding whether to keep it.</p></section>
      <hr class="project-rule"><div class="project-meta"><span>Story Start {html.escape(order['order_id'].upper())}</span><span>Opened {paid}</span><strong>{html.escape(label)}</strong></div>
      <div class="process-layout"><section class="process-section"><h2>Where the story is.</h2><ol class="timeline">{_timeline(order)}</ol></section>
      <section class="next-action"><header><span>Who has the next move</span><b>{html.escape(label)}</b></header><div class="next-action-body"><h2>{html.escape(heading)}</h2>{action}
      <dl class="receipt"><div class="receipt-row"><dt>Sponsor</dt><dd>{html.escape(intake.get('buyer_name') or '')}</dd></div>
      <div class="receipt-row"><dt>Relationship</dt><dd>{relationship}</dd></div><div class="receipt-row"><dt>Story Start</dt><dd>$5 paid · no subscription</dd></div>
      <div class="receipt-row"><dt>Finished result</dt><dd>$79 only after a private preview</dd></div></dl></div></section></div>
      <p class="trust-note">Keep this page private. It is your return path to the project. StorySitting never treats sponsor payment as storyteller consent.</p>
      <footer class="process-footer"><span>AMF LLC · Wilkinson, Indiana</span><span>Questions? adam@onesmallprompt.com</span></footer>
    </main>'''
    return page(f"{subject_raw}'s story", body)


def permission_page(order: dict) -> tuple[int, str]:
    if not _status_is_paid(order):
        return 404, message_page("This pass is not active.", "No call or payment action is available from this link.")
    if int(time.time()) > int(order.get("created_at", 0)) + PERMISSION_TTL_SECONDS:
        return 410, message_page("This Family Pass has expired.", "Ask the person who sent it to contact StorySitting. Nothing was scheduled.")
    status = order.get("permission_status")
    if status != "waiting_for_storyteller":
        return 200, permission_thanks(order)
    intake = order.get("intake", {})
    sponsor = html.escape(intake.get("buyer_name") or "Someone who cares about you")
    relationship = html.escape(intake.get("relationship") or "family member")
    introduction = html.escape(intake.get("personal_introduction") or f"I would love to keep one story in your own words.")
    token = html.escape(order["permission_token"], quote=True)
    body = f'''<main class="process-shell permission-sheet"><p class="process-eyebrow">A private invitation from {sponsor}</p>
      <section class="process-hero"><div><h1>Would you like to hear more?</h1></div><p class="process-lede">{sponsor}, your {relationship}, opened a Story Start for you. You decide whether anything continues.</p></section>
      <div class="permission-note"><small>Their note to you</small><p>“{introduction}”</p></div>
      <p>StorySitting uses an AI-assisted phone interviewer, but this page does not authorize or schedule that call. If you are interested, a real person first verifies your identity and explains the contact boundary. Recording and transcription need separate spoken permission at the sitting.</p>
      <form class="decision-form" method="post" action="/permission/{token}">
        <label class="decision"><input type="radio" name="decision" value="interested" required><span><strong>Yes, I am interested.</strong><span>Have a real person contact me first. No AI interview is scheduled by this answer.</span></span></label>
        <label class="decision"><input type="radio" name="decision" value="decline" required><span><strong>No thank you.</strong><span>Close this Story Start. No interview will be scheduled.</span></span></label>
        <label class="decision"><input type="radio" name="decision" value="never_call" required><span><strong>No—and never call this number.</strong><span>Close this Story Start and record a permanent do-not-call request.</span></span></label>
        <label class="field">What should we call you? <input name="storyteller_name" autocomplete="name" placeholder="Your preferred name"></label>
        <label class="field">Best time or accommodation <textarea name="human_check_preference" placeholder="Weekday mornings, please speak slowly, text my family first…"></textarea></label>
        <label class="field">Anything you want us to know <textarea name="storyteller_note" placeholder="Optional"></textarea></label>
        <button class="process-button" type="submit">Send my choice</button>
      </form><p class="trust-note">You can stop at any point. The sponsor cannot answer this human identity check for you, and your response here does not grant recording, transcription, editing, or family sharing.</p>
      <footer class="process-footer"><span>StorySitting · AMF LLC</span><span>adam@onesmallprompt.com</span></footer></main>'''
    return 200, page("Your Family Pass", body, description="A private StorySitting Family Pass")


def permission_thanks(order: dict) -> str:
    interested = order.get("permission_status") == "identity_pending"
    title = "Thank you. A human checks next." if interested else "Thank you. This Story Start is closed."
    copy = (
        "Your interested response arrived. No AI interview was scheduled. A real person must verify identity and explain the boundary before anything else can happen."
        if interested else
        "No interview will be scheduled from this Story Start. The sponsor will only see that you chose not to continue."
    )
    if order.get("do_not_call_recorded_at"):
        copy += " Your do-not-call request was recorded."
    body = f'''<main class="process-shell permission-sheet"><p class="process-eyebrow">Response received</p>
      <section class="process-hero"><div><h1>{html.escape(title)}</h1></div><p class="process-lede">{html.escape(copy)}</p></section>
      <hr class="project-rule"><p class="trust-note">You can close this page. No payment is connected to your response.</p>
      <footer class="process-footer"><span>StorySitting · AMF LLC</span><span>adam@onesmallprompt.com</span></footer></main>'''
    return page("Response received", body)


def message_page(title: str, copy: str, *, action: str = "") -> str:
    body = f'''<main class="process-shell permission-sheet"><p class="process-eyebrow">StorySitting</p>
      <section class="process-hero"><div><h1>{html.escape(title)}</h1></div><p class="process-lede">{html.escape(copy)}</p></section>{action}
      <footer class="process-footer"><a href="/">Back to StorySitting</a><span>adam@onesmallprompt.com</span></footer></main>'''
    return page(title, body)


def start_result_checkout(order: dict) -> tuple[int, str | dict]:
    if not _status_is_paid(order) or order.get("status") not in {"preview_ready", "result_checkout_pending"}:
        return 409, {"error": "The finished result is not ready for purchase."}
    if not order.get("result_manifest_ready"):
        return 409, {"error": "The finished package is still being verified. No payment was taken."}
    if order.get("result_checkout_url") and order.get("result_checkout_session"):
        ok, existing = stripe_call("GET", f"/checkout/sessions/{urllib.parse.quote(order['result_checkout_session'])}")
        if ok and existing.get("status") == "open":
            return 303, order["result_checkout_url"]
        order.pop("result_checkout_url", None)
        order.pop("result_checkout_session", None)
        order["result_version"] = int(order.get("result_version", 1)) + 1
        order["status"] = "preview_ready"
        write_order(order)
    _, result_price = _prices()
    ok, session = stripe_call(
        "POST",
        "/checkout/sessions",
        {"mode": "payment", "customer": order["stripe_customer"], "payment_method_types": ["card"],
         "line_items": [{"price": result_price, "quantity": 1}], "client_reference_id": order["order_id"],
         "success_url": f"{SITE_URL}/api/result/success?order={order['order_id']}&session_id={{CHECKOUT_SESSION_ID}}",
         "cancel_url": f"{SITE_URL}/story/{order['sponsor_token']}",
         "metadata": {"order_id": order["order_id"], "kind": "finished_result"}},
        idempotency_key=f"ss-result-{order['order_id']}-{order.get('result_version', 1)}",
    )
    if not ok:
        return 502, {"error": "Secure checkout could not be opened. No payment was taken."}
    order["result_checkout_session"] = session["id"]
    order["result_checkout_url"] = session["url"]
    order["status"] = "result_checkout_pending"
    write_order(order)
    return 303, session["url"]


def confirm_result_payment(order: dict, session_id: str) -> tuple[bool, str]:
    if session_id != order.get("result_checkout_session"):
        return False, "That receipt does not belong to this result."
    ok, session = stripe_call("GET", f"/checkout/sessions/{urllib.parse.quote(session_id)}?expand[]=payment_intent")
    metadata = session.get("metadata") if ok else {}
    if not ok or metadata.get("order_id") != order["order_id"] or metadata.get("kind") != "finished_result":
        return False, "That receipt does not belong to this result."
    if session.get("payment_status") != "paid":
        return False, "Stripe is still confirming the payment."
    if not order.get("result_manifest_ready"):
        order["result_payment_requires_review"] = True
        write_order(order)
        return False, "Payment arrived, but delivery needs a human check before access opens."
    payment_intent = session.get("payment_intent") or {}
    order["result_payment_status"] = "paid"
    order["result_payment_intent"] = payment_intent.get("id") if isinstance(payment_intent, dict) else payment_intent
    order["result_paid_at"] = int(time.time())
    order["status"] = "result_kept"
    order.pop("result_checkout_url", None)
    write_order(order)
    return True, "paid"


class Handler(BaseHTTPRequestHandler):
    server_version = "storysitting/3.0"

    def log_message(self, fmt: str, *args) -> None:
        print(f"{self.client_address[0]} {fmt % args}", flush=True)

    def _security_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("X-Robots-Tag", "noindex, nofollow, noarchive")
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        self.send_header("Content-Security-Policy", "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; img-src 'self' data:; font-src 'self'; style-src 'self'; script-src 'self'; form-action 'self'")

    def _send(self, status: int, body: str | bytes | dict, content_type: str = "text/html; charset=utf-8") -> None:
        if isinstance(body, dict):
            body = json.dumps(body)
            content_type = "application/json; charset=utf-8"
        raw = body.encode() if isinstance(body, str) else body
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(raw)))
        self._security_headers()
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(raw)

    def _redirect(self, location: str, status: int = HTTPStatus.SEE_OTHER) -> None:
        self.send_response(status)
        self.send_header("Location", location)
        self._security_headers()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _raw_body(self) -> bytes:
        length = int(self.headers.get("Content-Length", "0"))
        if length < 0 or length > MAX_BODY_BYTES:
            raise ValueError("Request is too large.")
        return self.rfile.read(length) if length else b""

    def _json_body(self) -> dict:
        value = json.loads(self._raw_body().decode() or "{}")
        if not isinstance(value, dict):
            raise ValueError("Invalid request.")
        return value

    def _form_body(self) -> dict:
        values = urllib.parse.parse_qs(self._raw_body().decode(), keep_blank_values=True)
        return {key: items[-1] if items else "" for key, items in values.items()}

    def _client_key(self, lane: str) -> str:
        forwarded = self.headers.get("X-Forwarded-For", "").split(",", 1)[0].strip()
        return f"{lane}:{forwarded or self.client_address[0]}"

    def do_HEAD(self) -> None:
        self.do_GET()

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        query = urllib.parse.parse_qs(parsed.query)
        if path == "/healthz":
            return self._send(200, {"ok": True, "version": 3})
        if path == "/api/success":
            order = read_order(query.get("order", [""])[0])
            if not order:
                return self._send(404, message_page("We could not find that Story Start.", "No product state was changed. If Stripe charged you, contact us with the receipt."))
            ok, message = confirm_start_payment(order, query.get("session_id", [""])[0])
            if not ok:
                return self._send(409, message_page("Payment is not confirmed yet.", message))
            return self._redirect(f"/story/{order['sponsor_token']}?welcome=1")
        if path == "/api/result/success":
            order = read_order(query.get("order", [""])[0])
            if not order:
                return self._send(404, message_page("We could not find that result.", "No access state was changed."))
            ok, message = confirm_result_payment(order, query.get("session_id", [""])[0])
            if not ok:
                return self._send(409, message_page("The result is not unlocked yet.", message))
            return self._redirect(f"/story/{order['sponsor_token']}?kept=1")
        if path.startswith("/story/"):
            token = path.split("/", 2)[2]
            order = find_order_by("sponsor_token", token)
            if not order or not _status_is_paid(order):
                return self._send(404, message_page("This private project page is not available.", "Check the link in your StorySitting receipt."))
            return self._send(200, project_page(order, welcome=query.get("welcome") == ["1"]))
        if path.startswith("/permission/"):
            token = path.split("/", 2)[2]
            order = find_order_by("permission_token", token)
            if not order:
                return self._send(404, message_page("This Family Pass is not available.", "Nothing was scheduled from this link."))
            status, content = permission_page(order)
            return self._send(status, content)
        return self._send(404, {"error": "not found"})

    def do_POST(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        try:
            if path == "/api/start":
                if not allow_request(self._client_key("start"), 8, 15 * 60):
                    return self._send(429, {"error": "Please wait before opening another Story Start."})
                status, result = handle_start(self._json_body(), self.headers.get("Idempotency-Key", ""))
                return self._send(status, result)
            if path == "/api/result/start":
                form = self._form_body()
                order = find_order_by("sponsor_token", form.get("sponsor_token", ""))
                if not order:
                    return self._send(404, message_page("This private project page is not available.", "No payment was taken."))
                with ORDER_LOCK:
                    status, result = start_result_checkout(order)
                if status == 303 and isinstance(result, str):
                    return self._redirect(result)
                return self._send(status, result)
            if path.startswith("/permission/"):
                token = path.split("/", 2)[2]
                if not allow_request(f"permission:{token}", 10, 60 * 60):
                    return self._send(429, message_page("Please pause for a moment.", "This pass has received too many responses. Nothing was scheduled."))
                order = find_order_by("permission_token", token)
                if not order:
                    return self._send(404, message_page("This Family Pass is not available.", "Nothing was scheduled from this link."))
                with ORDER_LOCK:
                    try:
                        record_permission_response(order, self._form_body())
                    except ValueError as error:
                        return self._send(400, message_page("We could not record that choice.", str(error)))
                return self._redirect(f"/permission/{token}")
            return self._send(404, {"error": "not found"})
        except (ValueError, json.JSONDecodeError):
            return self._send(400, {"error": "Invalid request."})
        except Exception as error:
            print(f"ERROR {path}: {type(error).__name__}: {error}", flush=True)
            return self._send(500, {"error": "StorySitting could not finish that step. No new charge or call was started."})


def main() -> None:
    _ensure_dirs()
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"storysitting storefront v3 on 127.0.0.1:{PORT} site={SITE_URL}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
