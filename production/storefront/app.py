#!/usr/bin/env python3
"""StorySitting's small production storefront and concierge journey.

This service intentionally does four things only:

* opens a $5 Story Start without saving a card for later charges;
* gives the sponsor a private project page and Family Pass;
* records the storyteller's interested / decline response without treating a
  bearer-link response as verified identity or consent to an AI interview;
* offers a choice of result editions only after an operator has finalized a
  real private preview and delivery package;
* charges only the difference when a family deliberately upgrades an edition.

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
import subprocess
import threading
import time
import uuid
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict, deque
from http.cookies import SimpleCookie
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


BASE_DIR = Path(os.environ.get("SS_BASE_DIR", "/opt/storysitting"))
PUBLIC_DIR = BASE_DIR / "storefront" / "public"
ORDERS_DIR = BASE_DIR / "orders-v2"
IDEMPOTENCY_DIR = BASE_DIR / "idempotency-v2"
DNC_DIR = BASE_DIR / "do-not-call-v2"
ACCOUNT_CODES_DIR = BASE_DIR / "account-codes-v1"
ACCOUNT_SESSIONS_DIR = BASE_DIR / "account-sessions-v1"
PURCHASE_INTENTS_DIR = BASE_DIR / "storekit-intents-v1"
STOREKIT_TRANSACTIONS_DIR = BASE_DIR / "storekit-transactions-v1"
APPLE_EVENTS_DIR = BASE_DIR / "apple-events-v1"
PRICES_CONF = BASE_DIR / "stripe-prices.conf"
KEY_FILE = Path(os.environ.get("SS_STRIPE_KEY_FILE", "/etc/onesmallprompt/stripe_secret"))
SITE_URL = os.environ.get("SS_SITE_URL", "https://storysitting.com").rstrip("/")
PORT = int(os.environ.get("SS_PORT", "8813"))
STRIPE_API = "https://api.stripe.com/v1"
PERMISSION_TTL_SECONDS = 30 * 24 * 60 * 60
MAX_BODY_BYTES = 64 * 1024
ACCOUNT_CODE_TTL_SECONDS = 10 * 60
ACCOUNT_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60
BASE_DELIVERY_KINDS = {"preview_audio", "full_recording", "transcript", "chapter", "archive", "permission_record"}
ALL_DELIVERY_KINDS = BASE_DELIVERY_KINDS | {"heirloom_pdf"}

STOREKIT_PRODUCTS = {
    "storyStart": {"product_id": "com.amflimited.storysitting.story.start", "price_cents": 500, "target": None, "source": None},
    "voiceEdition": {"product_id": "com.amflimited.storysitting.result.voice", "price_cents": 3900, "target": "voice", "source": None},
    "storyEdition": {"product_id": "com.amflimited.storysitting.result.story", "price_cents": 7900, "target": "story", "source": None},
    "heirloomEdition": {"product_id": "com.amflimited.storysitting.result.heirloom", "price_cents": 14900, "target": "heirloom", "source": None},
    "voiceToStory": {"product_id": "com.amflimited.storysitting.upgrade.voice.story", "price_cents": 4000, "target": "story", "source": "voice"},
    "voiceToHeirloom": {"product_id": "com.amflimited.storysitting.upgrade.voice.heirloom", "price_cents": 10999, "target": "heirloom", "source": "voice"},
    "storyToHeirloom": {"product_id": "com.amflimited.storysitting.upgrade.story.heirloom", "price_cents": 7000, "target": "heirloom", "source": "story"},
}

RESULT_OFFERS = {
    "voice": {
        "rank": 1,
        "name": "Voice Edition",
        "price_cents": 3900,
        "short": "The full voice and a readable record.",
        "description": "Full original recording, readable transcript, and permission record",
        "required_kinds": {"preview_audio", "full_recording", "transcript", "permission_record"},
        "entitlements": {"preview_audio", "full_recording", "transcript", "permission_record"},
        "features": ("Full original recording", "Readable transcript", "Permission record", "Portable downloads"),
    },
    "story": {
        "rank": 2,
        "name": "Story Edition",
        "price_cents": 7900,
        "short": "The voice, shaped into a source-linked story.",
        "description": "Voice Edition plus a source-linked chapter, archive, and one correction round",
        "required_kinds": BASE_DELIVERY_KINDS,
        "entitlements": BASE_DELIVERY_KINDS,
        "features": ("Everything in Voice", "Source-linked finished chapter", "Complete family archive", "One correction round"),
    },
    "heirloom": {
        "rank": 3,
        "name": "Heirloom Edition",
        "price_cents": 14900,
        "short": "A designed edition made for the family shelf.",
        "description": "Story Edition plus a print-ready heirloom PDF and a second correction round",
        "required_kinds": BASE_DELIVERY_KINDS | {"heirloom_pdf"},
        "entitlements": BASE_DELIVERY_KINDS | {"heirloom_pdf"},
        "features": ("Everything in Story", "Print-ready heirloom PDF", "Photo and artifact layout", "Two correction rounds total"),
    },
}

ORDER_LOCK = threading.RLock()
RATE_LOCK = threading.Lock()
RATE_EVENTS: dict[str, deque[float]] = defaultdict(deque)

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
TOKEN_RE = re.compile(r"^[A-Za-z0-9_-]{24,96}$")
ACCOUNT_CODE_RE = re.compile(r"^[0-9]{6}$")
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
    for path in (
        ORDERS_DIR, IDEMPOTENCY_DIR, DNC_DIR, ACCOUNT_CODES_DIR, ACCOUNT_SESSIONS_DIR,
        PURCHASE_INTENTS_DIR, STOREKIT_TRANSACTIONS_DIR,
        APPLE_EVENTS_DIR,
    ):
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
    shape = str(payload.get("story_shape", "open")).strip().lower()
    intake["story_shape"] = shape if shape in {"open", "moment", "person", "place", "tradition", "lesson"} else "open"
    intake["artifact_note"] = str(payload.get("artifact_note", "")).strip()[:2000]
    intake["family_context"] = str(payload.get("family_context", "")).strip()[:1000]
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


def normalize_email(value: object) -> str | None:
    email = str(value or "").strip().lower()
    return email if len(email) <= 254 and EMAIL_RE.fullmatch(email) else None


def find_orders_by_email(email: str) -> list[dict]:
    normalized = normalize_email(email)
    if not normalized:
        return []
    orders: list[dict] = []
    for path in ORDERS_DIR.glob("ss_*.json"):
        try:
            with path.open(encoding="utf-8") as source:
                order = json.load(source)
            buyer_email = normalize_email((order.get("intake") or {}).get("buyer_email"))
            if buyer_email == normalized and _status_is_paid(order):
                orders.append(order)
        except (OSError, json.JSONDecodeError):
            continue
    return sorted(orders, key=lambda item: int(item.get("created_at", 0)), reverse=True)


def _account_record_path(directory: Path, identity: str) -> Path:
    return directory / f"{hashlib.sha256(identity.encode()).hexdigest()}.json"


def _code_digest(salt: str, code: str) -> str:
    return hashlib.sha256(f"{salt}:{code}".encode()).hexdigest()


def _is_app_review_login(email: str, code: str) -> bool:
    """Match the isolated App Review account without weakening normal OTPs."""
    review_email = normalize_email(os.environ.get("SS_APP_REVIEW_EMAIL"))
    review_code = str(os.environ.get("SS_APP_REVIEW_CODE") or "").strip()
    return bool(
        review_email
        and ACCOUNT_CODE_RE.fullmatch(review_code)
        and secrets.compare_digest(email, review_email)
        and secrets.compare_digest(code, review_code)
    )


def _issue_account_session(email: str, now: int | None = None) -> str:
    created_at = int(time.time()) if now is None else now
    token = secrets.token_urlsafe(36)
    atomic_write(
        _account_record_path(ACCOUNT_SESSIONS_DIR, token),
        {
            "email": email,
            "created_at": created_at,
            "expires_at": created_at + ACCOUNT_SESSION_TTL_SECONDS,
        },
    )
    return token


def _safe_mail_header(value: str) -> str:
    return re.sub(r"[\r\n]+", " ", value).strip()[:240]


def send_account_email(recipient: str, subject: str, text: str) -> None:
    message = (
        f"From: StorySitting <hello@storysitting.com>\n"
        f"To: {_safe_mail_header(recipient)}\n"
        f"Subject: {_safe_mail_header(subject)}\n"
        "MIME-Version: 1.0\n"
        "Content-Type: text/plain; charset=utf-8\n"
        "Content-Transfer-Encoding: 8bit\n"
        "Auto-Submitted: auto-generated\n\n"
        f"{text.rstrip()}\n"
    )
    completed = subprocess.run(
        ["/usr/sbin/sendmail", "-t", "-oi"],
        input=message.encode(),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        timeout=15,
        check=False,
    )
    if completed.returncode != 0:
        raise RuntimeError("mail transport rejected the account message")


def request_account_code(email: object) -> bool:
    """Send a one-time code without revealing whether the email has projects."""
    normalized = normalize_email(email)
    if not normalized:
        return False
    orders = find_orders_by_email(normalized)
    if not orders:
        return True
    if normalize_email(os.environ.get("SS_APP_REVIEW_EMAIL")) == normalized:
        return True
    code = f"{secrets.randbelow(1_000_000):06d}"
    salt = secrets.token_hex(16)
    atomic_write(
        _account_record_path(ACCOUNT_CODES_DIR, normalized),
        {
            "email": normalized,
            "code_digest": _code_digest(salt, code),
            "salt": salt,
            "created_at": int(time.time()),
            "expires_at": int(time.time()) + ACCOUNT_CODE_TTL_SECONDS,
            "attempts": 0,
        },
    )
    first_name = str((orders[0].get("intake") or {}).get("buyer_name") or "there").split()[0]
    send_account_email(
        normalized,
        f"Your StorySitting sign-in code is {code}",
        f"Hi {first_name},\n\nYour StorySitting sign-in code is:\n\n{code}\n\n"
        "It expires in 10 minutes and can be used once. If you did not request it, you can ignore this email.\n\n"
        f"StorySitting\n{SITE_URL}",
    )
    return True


def verify_account_code(email: object, code: object) -> str | None:
    normalized = normalize_email(email)
    submitted = str(code or "").strip()
    if not normalized or not ACCOUNT_CODE_RE.fullmatch(submitted):
        return None
    if _is_app_review_login(normalized, submitted):
        return _issue_account_session(normalized) if find_orders_by_email(normalized) else None
    path = _account_record_path(ACCOUNT_CODES_DIR, normalized)
    try:
        record = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    now = int(time.time())
    if now > int(record.get("expires_at", 0)) or int(record.get("attempts", 0)) >= 6:
        return None
    expected = _code_digest(str(record.get("salt", "")), submitted)
    if not secrets.compare_digest(str(record.get("code_digest", "")), expected):
        record["attempts"] = int(record.get("attempts", 0)) + 1
        atomic_write(path, record)
        return None
    if not find_orders_by_email(normalized):
        return None
    token = _issue_account_session(normalized, now)
    try:
        path.unlink()
    except FileNotFoundError:
        pass
    return token


def account_email_for_session(token: object) -> str | None:
    candidate = str(token or "").strip()
    if not TOKEN_RE.fullmatch(candidate):
        return None
    path = _account_record_path(ACCOUNT_SESSIONS_DIR, candidate)
    try:
        record = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if int(time.time()) > int(record.get("expires_at", 0)):
        return None
    return normalize_email(record.get("email"))


def revoke_account_session(token: object) -> None:
    candidate = str(token or "").strip()
    if TOKEN_RE.fullmatch(candidate):
        try:
            _account_record_path(ACCOUNT_SESSIONS_DIR, candidate).unlink()
        except FileNotFoundError:
            pass


def send_project_access_email(order: dict) -> bool:
    if order.get("access_email_sent_at"):
        return True
    intake = order.get("intake") or {}
    email = normalize_email(intake.get("buyer_email"))
    if not email:
        return False
    name = str(intake.get("buyer_name") or "there").split()[0]
    storyteller = str(intake.get("subject_name") or "your storyteller")
    project_url = f"{SITE_URL}/story/{order['sponsor_token']}"
    send_account_email(
        email,
        f"{storyteller}'s StorySitting is open",
        f"Hi {name},\n\nYour $5 Story Start is confirmed.\n\n"
        f"Open the private project:\n{project_url}\n\n"
        f"Or sign in to all your StorySitting projects:\n{SITE_URL}/account/\n\n"
        "The Family Pass is inside the project. Payment starts the permission work; it does not authorize an AI call.\n\n"
        "StorySitting",
    )
    order["access_email_sent_at"] = int(time.time())
    order.pop("access_email_error", None)
    write_order(order)
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
    try:
        send_project_access_email(order)
    except Exception as error:
        order["access_email_error"] = type(error).__name__
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
    ("Choose what to keep", "Voice, finished story, or heirloom—only after the preview."),
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


def _manifest_kinds(order: dict) -> set[str]:
    entries = (order.get("result_manifest") or {}).get("files", [])
    return {str(entry.get("kind")) for entry in entries if isinstance(entry, dict) and entry.get("kind")}


def result_offer_ready(order: dict, offer_id: str) -> bool:
    offer = RESULT_OFFERS.get(offer_id)
    return bool(order.get("result_manifest_ready") and offer and offer["required_kinds"] <= _manifest_kinds(order))


def _active_result_payments(order: dict) -> list[dict]:
    return [
        payment for payment in order.get("result_payments", [])
        if isinstance(payment, dict) and payment.get("status") == "paid"
    ]


def result_paid_total_cents(order: dict) -> int:
    payments = _active_result_payments(order)
    if payments:
        return sum(max(0, int(payment.get("amount_cents", 0))) for payment in payments)
    # Read old v3 orders as the original $79 Story Edition. New payments always
    # use the append-only result_payments ledger below.
    if "result_payments" not in order and order.get("result_payment_status") == "paid" and not order.get("result_payment_revoked_at"):
        return 7900
    return 0


def active_result_offer_id(order: dict) -> str | None:
    paid = result_paid_total_cents(order)
    eligible = [
        offer_id for offer_id, offer in RESULT_OFFERS.items()
        if int(offer["price_cents"]) <= paid and result_offer_ready(order, offer_id)
    ]
    if not eligible:
        return None
    return max(eligible, key=lambda offer_id: int(RESULT_OFFERS[offer_id]["rank"]))


def refresh_result_entitlement(order: dict) -> str | None:
    offer_id = active_result_offer_id(order)
    order["result_paid_total_cents"] = result_paid_total_cents(order)
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


def _offer_selection(order: dict) -> str:
    active_id = active_result_offer_id(order)
    paid_total = result_paid_total_cents(order)
    cards: list[str] = []
    for offer_id, offer in sorted(RESULT_OFFERS.items(), key=lambda item: int(item[1]["rank"])):
        ready = result_offer_ready(order, offer_id)
        current = active_id == offer_id
        already_covered = bool(active_id and int(RESULT_OFFERS[active_id]["rank"]) >= int(offer["rank"]))
        due = max(0, int(offer["price_cents"]) - paid_total)
        feature_rows = "".join(f"<li>{html.escape(feature)}</li>" for feature in offer["features"])
        if current:
            action = '<span class="edition-state">Your current edition</span>'
        elif already_covered:
            action = '<span class="edition-state">Included in your edition</span>'
        elif not ready:
            action = '<span class="edition-state quiet">Available when its design files pass review</span>'
        else:
            button = f"Upgrade · ${due // 100}" if paid_total else f"Choose · ${due // 100}"
            action = (
                f'<form method="post" action="/api/result/start">'
                f'<input type="hidden" name="sponsor_token" value="{html.escape(order["sponsor_token"], quote=True)}">'
                f'<input type="hidden" name="offer_id" value="{offer_id}">'
                f'<button class="process-button" type="submit">{html.escape(button)}</button></form>'
            )
        badge = "Most complete" if offer_id == "heirloom" else ("Most chosen" if offer_id == "story" else "Lowest price")
        cards.append(
            f'<article class="edition-card {"current" if current else ""}"><header><small>{html.escape(badge)}</small>'
            f'<strong>{html.escape(str(offer["name"]))}</strong><b>${int(offer["price_cents"]) // 100}</b></header>'
            f'<p>{html.escape(str(offer["short"]))}</p><ul>{feature_rows}</ul>{action}</article>'
        )
    upgrade_note = (
        f'<p class="edition-note">You have paid ${paid_total // 100}. Any upgrade charges only the difference. No subscription, new call, or automatic charge.</p>'
        if paid_total else
        '<p class="edition-note">Choose after listening. You can start with Voice and pay only the difference later if the family wants more.</p>'
    )
    return '<div class="edition-grid">' + "".join(cards) + "</div>" + upgrade_note


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
        return "Closed with respect", "They chose not to continue.", f"<p>No interview will be scheduled for this Story Start.{never} No result edition is offered.</p>"
    if status in {"permission_verified", "sitting_scheduled"}:
        return "StorySitting has it", "The authorized sitting is being arranged.", "<p>Identity and contact permission are verified. The storyteller will still hear the AI and recording disclosures at the sitting and can stop at any time.</p>"
    if status in {"sitting_complete", "editing"}:
        return "StorySitting is working", "The source is becoming a private preview.", "<p>The sitting is complete. We are checking the transcript, shaping the chapter, linking source passages, and preparing the strongest preview.</p>"
    if status == "preview_ready":
        excerpt = html.escape(str(order.get("preview_excerpt") or "Your private preview is ready."))
        title = html.escape(str(order.get("preview_title") or "A finished passage"))
        preview_entry = next((entry for entry in (order.get("result_manifest") or {}).get("files", []) if entry.get("kind") == "preview_audio"), None)
        audio = (
            f'<audio class="preview-audio" controls preload="metadata" src="/media/{html.escape(order["sponsor_token"], quote=True)}/preview_audio">Your browser cannot play this private preview.</audio>'
            if preview_entry else ""
        )
        body = (
            f'<div class="permission-note"><small>Private preview</small><p><strong>{title}</strong><br>{excerpt}</p></div>'
            + audio +
            "<p>Now choose the layer your family wants to keep. Every edition is a one-time purchase; none creates another call or a subscription.</p>"
            + _offer_selection(order)
        )
        return "Waiting on you", "Hear it first. Then choose what belongs on the shelf.", body
    if status == "result_checkout_pending":
        body = (
            "<p>Stripe has not confirmed the edition purchase yet. No entitlement changes until payment is confirmed.</p>"
            + _offer_selection(order)
        )
        return "Waiting on payment", "The full result is still private.", body
    if status == "result_kept":
        active_id = active_result_offer_id(order)
        allowed = RESULT_OFFERS.get(active_id or "", {}).get("entitlements", set())
        entries = [entry for entry in (order.get("result_manifest") or {}).get("files", []) if entry.get("kind") in allowed and entry.get("kind") != "preview_audio"]
        links = "".join(
            f'<a class="process-button secondary" href="/media/{html.escape(order["sponsor_token"], quote=True)}/{html.escape(str(entry.get("kind")), quote=True)}">{html.escape(str(entry.get("label") or entry.get("kind")))}</a>'
            for entry in entries
        )
        edition = RESULT_OFFERS.get(active_id or "", {})
        return (
            "On the Story Shelf",
            f"{edition.get('name', 'The result')} belongs to the family.",
            f"<p>Download every file included in this edition. The private preview and storyteller controls remain unchanged.</p>"
            f'<div class="button-row download-row">{links}</div>'
            + _offer_selection(order)
            + '<div class="print-note"><strong>Want a bound copy?</strong><p>After the Heirloom PDF is approved, a printed book starts at $89 plus shipping. We confirm the exact total before payment.</p><a href="mailto:adam@onesmallprompt.com?subject=StorySitting%20printed%20book">Ask about print →</a></div>'
            + '<div class="button-row"><a class="process-button" href="/#start">Start another sitting · $5</a></div>'
        )
    return "StorySitting is checking", "Your project is safe.", "<p>We are checking the next step. No new charge or call will happen automatically.</p>"


def page(title: str, body: str, *, description: str = "Private StorySitting project") -> str:
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(title)} — StorySitting</title><meta name="description" content="{html.escape(description, quote=True)}">
<meta name="robots" content="noindex,nofollow,noarchive"><link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/fonts/fonts.css"><link rel="stylesheet" href="/fonts/fonts-prose.css">
<link rel="stylesheet" href="/assets/process-v2.css?v=20260811c"><script src="/assets/process-v2.js?v=20260811a" defer></script>
</head><body><header class="process-header"><a class="process-brand" href="/">StorySitting</a><span>The storyteller controls the story.</span></header>{body}</body></html>'''


def account_login_page(error: str = "") -> str:
    notice = f'<p class="account-error" role="alert">{html.escape(error)}</p>' if error else ""
    body = f'''<main class="process-shell account-shell"><p class="process-eyebrow">Sponsor account</p>
      <section class="process-hero"><div><h1>Your stories,<br>in one place.</h1></div><p class="process-lede">Use the email from your Story Start. We will send a six-digit code—no password to remember and no social login tracking.</p></section>
      <div class="account-panel">{notice}<form method="post" action="/account/request-code" class="account-form">
        <label class="field">Email address<input name="email" type="email" autocomplete="email" inputmode="email" required autofocus></label>
        <button class="process-button" type="submit">Email my sign-in code</button>
      </form><p class="trust-note">For privacy, the response looks the same whether or not an email has a project. Codes expire after 10 minutes.</p></div>
      <footer class="process-footer"><a href="/">Back to StorySitting</a><span>Need help? adam@onesmallprompt.com</span></footer></main>'''
    return page("Your StorySitting account", body, description="Sign in to the private StorySitting sponsor dashboard")


def account_code_page(email: str, error: str = "") -> str:
    notice = f'<p class="account-error" role="alert">{html.escape(error)}</p>' if error else ""
    safe_email = html.escape(email)
    quoted_email = html.escape(email, quote=True)
    body = f'''<main class="process-shell account-shell"><p class="process-eyebrow">Check your email</p>
      <section class="process-hero"><div><h1>Enter the<br>six digits.</h1></div><p class="process-lede">If <strong>{safe_email}</strong> has a paid Story Start, its one-time code is on the way.</p></section>
      <div class="account-panel">{notice}<form method="post" action="/account/verify-code" class="account-form">
        <input type="hidden" name="email" value="{quoted_email}">
        <label class="field">Six-digit code<input name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{{6}}" maxlength="6" required autofocus></label>
        <button class="process-button" type="submit">Open my Story Shelf</button>
      </form><form method="post" action="/account/request-code" class="account-resend"><input type="hidden" name="email" value="{quoted_email}"><button type="submit">Send a new code</button></form></div>
      <footer class="process-footer"><a href="/account/">Use a different email</a><span>Codes expire after 10 minutes</span></footer></main>'''
    return page("Enter your StorySitting code", body, description="Verify your private StorySitting sponsor account")


def account_dashboard_page(email: str, orders: list[dict]) -> str:
    cards: list[str] = []
    for order in orders:
        intake = order.get("intake") or {}
        person = str(intake.get("subject_name") or "Your storyteller")
        label, heading, _ = _next_action(order)
        opened = time.strftime("%b %d, %Y", time.gmtime(int(order.get("paid_at", order.get("created_at", 0)))))
        kept = active_result_offer_id(order)
        edition = f"{RESULT_OFFERS[kept]['name']} kept" if kept else "$5 Story Start"
        cards.append(
            f'''<article class="account-project"><header><span>{html.escape(label)}</span><small>{html.escape(opened)}</small></header>
            <h2>{html.escape(person)}</h2><p>{html.escape(heading)}</p>
            <footer><span>{html.escape(edition)}</span><a href="/story/{html.escape(order['sponsor_token'], quote=True)}">Open project <b>→</b></a></footer></article>'''
        )
    first = str((orders[0].get("intake") or {}).get("buyer_name") or "there").split()[0] if orders else "there"
    body = f'''<main class="process-shell dashboard-shell"><div class="dashboard-mast"><div><p class="process-eyebrow">Private Story Shelf</p><h1>Welcome back,<br>{html.escape(first)}.</h1><p>Every person has one current step and one next action. No storyteller needs an account.</p></div>
      <form method="post" action="/account/logout"><button class="account-logout" type="submit">Sign out</button></form></div>
      <div class="dashboard-summary"><span><strong>{len(orders)}</strong> family project{'' if len(orders) == 1 else 's'}</span><span><strong>$0</strong> recurring fees</span><a href="/start/">Open another Story Start · $5</a></div>
      <section class="account-projects">{''.join(cards)}</section>
      <p class="trust-note">Signed in as {html.escape(email)}. Account access never changes the storyteller's permissions or sharing choices.</p>
      <footer class="process-footer"><span>StorySitting · AMF LLC</span><a href="mailto:adam@onesmallprompt.com">Contact Adam</a></footer></main>'''
    return page("Your StorySitting dashboard", body, description="Your private family StorySitting projects")


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
      <div class="receipt-row"><dt>Result editions</dt><dd>$39 voice · $79 story · $149 heirloom, only after preview</dd></div></dl></div></section></div>
      <p class="trust-note">Keep this page private. It is your return path to the project. StorySitting never treats sponsor payment as storyteller consent.</p>
      <footer class="process-footer"><a href="/dashboard/">All family projects</a><span>Questions? adam@onesmallprompt.com</span></footer>
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


def _checkout_attempt(order: dict, session_id: str) -> dict | None:
    for attempt in order.get("result_checkout_attempts", []):
        if isinstance(attempt, dict) and attempt.get("stripe_checkout_session") == session_id:
            return attempt
    # Compatibility for a v3 Checkout created before the edition ledger.
    if order.get("result_checkout_session") == session_id:
        return {
            "attempt_id": "legacy-v3",
            "offer_id": "story",
            "amount_cents": 7900,
            "stripe_checkout_session": session_id,
            "status": "open",
        }
    return None


def start_result_checkout(order: dict, offer_id: str = "story") -> tuple[int, str | dict]:
    if not _status_is_paid(order) or order.get("status") not in {"preview_ready", "result_checkout_pending", "result_kept"}:
        return 409, {"error": "The private preview is not ready for an edition choice."}
    offer = RESULT_OFFERS.get(offer_id)
    if not offer:
        return 400, {"error": "Choose a valid result edition."}
    if not result_offer_ready(order, offer_id):
        return 409, {"error": "That edition is still in quality review. No payment was taken."}

    paid_total = result_paid_total_cents(order)
    amount_due = int(offer["price_cents"]) - paid_total
    if amount_due <= 0:
        return 409, {"error": "That edition is already included in what you keep."}

    attempts = order.setdefault("result_checkout_attempts", [])
    # A richer catalog makes parallel stale Checkouts more likely. Close every
    # other open attempt before opening a new price point so a family cannot
    # accidentally pay both a direct edition price and an obsolete upgrade.
    for prior in attempts:
        if not isinstance(prior, dict) or prior.get("status") not in {"creating", "open"}:
            continue
        same_choice = prior.get("offer_id") == offer_id and int(prior.get("from_paid_cents", -1)) == paid_total
        if same_choice:
            continue
        prior_session = str(prior.get("stripe_checkout_session") or "")
        if not prior_session:
            prior["status"] = "superseded"
            prior["closed_at"] = int(time.time())
            continue
        ok, existing = stripe_call("GET", f"/checkout/sessions/{urllib.parse.quote(prior_session)}")
        if ok and existing.get("payment_status") == "paid":
            confirm_result_payment(order, prior_session)
            return 409, {"error": "A previous edition payment just completed. Refresh the project before choosing an upgrade."}
        if ok and existing.get("status") == "open":
            expired, _ = stripe_call("POST", f"/checkout/sessions/{urllib.parse.quote(prior_session)}/expire")
            prior["status"] = "expired" if expired else "superseded"
        else:
            prior["status"] = "expired" if ok and existing.get("status") == "expired" else "superseded"
        prior["closed_at"] = int(time.time())
    write_order(order)

    for attempt in attempts:
        if not isinstance(attempt, dict) or attempt.get("offer_id") != offer_id or int(attempt.get("from_paid_cents", -1)) != paid_total:
            continue
        session_id = str(attempt.get("stripe_checkout_session") or "")
        if attempt.get("status") == "creating" and not session_id:
            active_attempt = attempt
            break
        if attempt.get("status") == "open" and session_id:
            ok, existing = stripe_call("GET", f"/checkout/sessions/{urllib.parse.quote(session_id)}")
            if ok and existing.get("status") == "open" and attempt.get("checkout_url"):
                return 303, str(attempt["checkout_url"])
            if ok and existing.get("payment_status") == "paid":
                paid, message = confirm_result_payment(order, session_id)
                if paid:
                    return 303, f"{SITE_URL}/story/{order['sponsor_token']}"
                return 409, {"error": message}
            attempt["status"] = "expired" if ok and existing.get("status") == "expired" else "closed"
            attempt["closed_at"] = int(time.time())
            write_order(order)
    else:
        active_attempt = {
            "attempt_id": "ra_" + secrets.token_hex(10),
            "offer_id": offer_id,
            "from_paid_cents": paid_total,
            "amount_cents": amount_due,
            "status": "creating",
            "created_at": int(time.time()),
        }
        attempts.append(active_attempt)
        write_order(order)

    metadata = {
        "order_id": order["order_id"],
        "kind": "finished_result",
        "offer_id": offer_id,
        "attempt_id": active_attempt["attempt_id"],
        "amount_cents": str(amount_due),
    }
    ok, session = stripe_call(
        "POST",
        "/checkout/sessions",
        {
            "mode": "payment",
            "customer": order["stripe_customer"],
            "payment_method_types": ["card"],
            "line_items": [{
                "price_data": {
                    "currency": "usd",
                    "unit_amount": amount_due,
                    "product_data": {
                        "name": f"StorySitting {offer['name']}",
                        "description": offer["description"],
                    },
                },
                "quantity": 1,
            }],
            "client_reference_id": order["order_id"],
            "success_url": f"{SITE_URL}/api/result/success?order={order['order_id']}&session_id={{CHECKOUT_SESSION_ID}}",
            "cancel_url": f"{SITE_URL}/story/{order['sponsor_token']}",
            "metadata": metadata,
            "payment_intent_data": {"metadata": metadata},
            "custom_text": {"submit": {"message": "This is a one-time edition choice after preview. It does not schedule a call or start a subscription."}},
        },
        idempotency_key=f"ss-result-attempt-{active_attempt['attempt_id']}",
    )
    if not ok:
        active_attempt["status"] = "failed"
        active_attempt["failed_at"] = int(time.time())
        write_order(order)
        return 502, {"error": "Secure checkout could not be opened. No payment was taken."}
    active_attempt["stripe_checkout_session"] = session["id"]
    active_attempt["checkout_url"] = session["url"]
    active_attempt["status"] = "open"
    order["result_checkout_session"] = session["id"]
    order["result_checkout_url"] = session["url"]
    if not active_result_offer_id(order):
        order["status"] = "result_checkout_pending"
    write_order(order)
    return 303, session["url"]


def confirm_result_payment(order: dict, session_id: str) -> tuple[bool, str]:
    attempt = _checkout_attempt(order, session_id)
    if not attempt:
        return False, "That receipt does not belong to this result."
    ok, session = stripe_call("GET", f"/checkout/sessions/{urllib.parse.quote(session_id)}?expand[]=payment_intent")
    metadata = session.get("metadata") if ok else {}
    offer_id = str(attempt.get("offer_id") or "")
    amount_cents = int(attempt.get("amount_cents", 0))
    expected_attempt = str(attempt.get("attempt_id") or "")
    if (
        not ok
        or metadata.get("order_id") != order["order_id"]
        or metadata.get("kind") != "finished_result"
        or (expected_attempt != "legacy-v3" and metadata.get("attempt_id") != expected_attempt)
        or (expected_attempt != "legacy-v3" and metadata.get("offer_id") != offer_id)
        or (expected_attempt != "legacy-v3" and metadata.get("amount_cents") != str(amount_cents))
    ):
        return False, "That receipt does not belong to this result."
    if session.get("payment_status") != "paid":
        return False, "Stripe is still confirming the payment."
    if session.get("amount_total") is not None and int(session.get("amount_total")) != amount_cents:
        return False, "The paid amount does not match this edition. A human will review it."
    payments = order.setdefault("result_payments", [])
    existing_payment = next((payment for payment in payments if payment.get("stripe_checkout_session") == session_id), None)
    payment_intent = session.get("payment_intent") or {}
    payment_intent_id = payment_intent.get("id") if isinstance(payment_intent, dict) else payment_intent
    if existing_payment:
        if existing_payment.get("status") == "paid":
            refresh_result_entitlement(order)
            write_order(order)
            return True, "paid"
        return False, "That duplicate edition payment was already reversed."

    current_paid = result_paid_total_cents(order)
    expected_from = int(attempt.get("from_paid_cents", 0))
    expected_due = int(RESULT_OFFERS.get(offer_id, {}).get("price_cents", 0)) - current_paid
    stale_attempt = expected_attempt != "legacy-v3" and (
        current_paid != expected_from or amount_cents != expected_due or expected_due <= 0
    )
    if stale_attempt:
        refunded = False
        if payment_intent_id:
            refunded, _ = stripe_call(
                "POST",
                "/refunds",
                {
                    "payment_intent": payment_intent_id,
                    "reason": "duplicate",
                    "metadata": {
                        "order_id": order["order_id"],
                        "attempt_id": expected_attempt,
                        "reason": "stale_result_edition_attempt",
                    },
                },
                idempotency_key=f"ss-result-stale-refund-{session_id}",
            )
        payments.append({
            "stripe_checkout_session": session_id,
            "stripe_payment_intent": payment_intent_id,
            "attempt_id": expected_attempt,
            "offer_id": offer_id,
            "amount_cents": amount_cents,
            "status": "refunded" if refunded else "refund_required",
            "paid_at": int(time.time()),
            "revoked_at": int(time.time()) if refunded else None,
        })
        attempt["status"] = "refunded" if refunded else "refund_required"
        attempt["stripe_payment_intent"] = payment_intent_id
        order["result_payment_requires_review"] = not refunded
        refresh_result_entitlement(order)
        write_order(order)
        return False, (
            "That Checkout was replaced by a newer edition choice, so its duplicate payment was refunded."
            if refunded else
            "That Checkout was replaced by a newer edition choice. Its duplicate payment is queued for a human refund."
        )

    if not result_offer_ready(order, offer_id):
        order["result_payment_requires_review"] = True
        write_order(order)
        return False, "Payment arrived, but delivery needs a human check before access opens."

    payments.append({
        "stripe_checkout_session": session_id,
        "stripe_payment_intent": payment_intent_id,
        "attempt_id": expected_attempt,
        "offer_id": offer_id,
        "amount_cents": amount_cents,
        "status": "paid",
        "paid_at": int(time.time()),
    })
    if expected_attempt != "legacy-v3":
        attempt["status"] = "paid"
        attempt["paid_at"] = int(time.time())
        attempt["stripe_payment_intent"] = payment_intent_id
    order["result_payment_intent"] = payment_intent_id
    order.setdefault("result_paid_at", int(time.time()))
    refresh_result_entitlement(order)
    if order.get("result_checkout_session") == session_id:
        order.pop("result_checkout_url", None)
    write_order(order)
    return True, "paid"


def result_manifest_complete(order: dict, offer_id: str = "story") -> bool:
    return result_offer_ready(order, offer_id)


def media_entry(order: dict, kind: str) -> dict | None:
    allowed = {"preview_audio"} if order.get("status") in {"preview_ready", "result_checkout_pending", "result_kept"} else set()
    offer_id = active_result_offer_id(order)
    if offer_id:
        allowed |= set(RESULT_OFFERS[offer_id]["entitlements"])
    if kind not in allowed:
        return None
    for entry in (order.get("result_manifest") or {}).get("files", []):
        if entry.get("kind") == kind:
            return entry
    return None


def _iso8601(epoch: object) -> str | None:
    try:
        value = int(epoch)
    except (TypeError, ValueError):
        return None
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(value))


def _mobile_relationship(value: object, storyteller_name: object = "") -> str:
    relationship = f"{value or ''} {storyteller_name or ''}".lower()
    for needle, result in (
        ("grandmother", "grandmother"), ("grandma", "grandmother"),
        ("grandfather", "grandfather"), ("grandpa", "grandfather"),
        ("mother", "mother"), ("mom", "mother"), ("father", "father"), ("dad", "father"),
        ("aunt", "aunt"), ("uncle", "uncle"), ("friend", "familyFriend"),
    ):
        if needle in relationship:
            return result
    return "other"


def _mobile_role(value: object) -> str:
    relationship = str(value or "").lower()
    if "grand" in relationship:
        return "grandchild"
    if any(word in relationship for word in ("daughter", "son", "child")):
        return "adultChild"
    return "otherFamily"


def _mobile_questions(order: dict) -> list[dict]:
    intake = order.get("intake") or {}
    saved = order.get("family_questions") or []
    if saved:
        return [question for question in saved if isinstance(question, dict)]
    seeds = order.get("story_seeds") or []
    if not seeds:
        capture = str(intake.get("capture") or "").strip()
        seeds = [item.strip() for item in re.split(r"[\n.;]+", capture) if item.strip()]
    questions: list[dict] = []
    for index, seed in enumerate(seeds[:8]):
        prompt = str(seed).strip()
        if not prompt:
            continue
        questions.append({
            "id": f"q_{order['order_id']}_{index + 1}",
            "prompt": prompt if prompt.endswith("?") else f"Tell us about {prompt[0].lower() + prompt[1:] if len(prompt) > 1 else prompt.lower()}.",
            "category": "beginnings" if index == 0 else "people",
            "isSelected": True,
            "answeredInChapterID": None,
            "submittedBy": str(intake.get("buyer_name") or "Family"),
        })
    return questions


def mobile_project(order: dict) -> dict:
    intake = order.get("intake") or {}
    status = str(order.get("status") or "permission_pending")
    subject = str(intake.get("subject_name") or "Your storyteller")
    created = int(order.get("paid_at", order.get("created_at", time.time())))
    responded = order.get("permission_responded_at")
    human_checked = order.get("managed_human_check_at")
    identity_verified = order.get("identity_verified_at")
    permission_granted = order.get("permission_granted_at")
    scheduled_for = order.get("scheduled_for")
    permission_declined = status == "permission_declined"
    permission_status = (
        "declined" if permission_declined else
        "granted" if permission_granted and identity_verified and human_checked and responded else
        "awaitingManagedHumanCheck" if responded else
        "awaitingFamilyPassResponse"
    )
    call_status = {
        "permission_pending": "awaitingFamilyPassResponse",
        "identity_pending": "awaitingManagedHumanPermissionCheck",
        "permission_verified": "scheduled",
        "sitting_scheduled": "scheduled",
        "sitting_complete": "craftingPreview",
        "editing": "craftingPreview",
        "preview_ready": "previewReady",
        "result_checkout_pending": "previewReady",
        "result_kept": "delivered",
        "permission_declined": "permissionDeclined",
        "closed": "cancelled",
    }.get(status, "awaitingFamilyPassResponse")
    kept = active_result_offer_id(order)
    preview_visible = status in {"preview_ready", "result_checkout_pending", "result_kept"}
    chapter_id = f"chapter_{order['order_id']}" if preview_visible else None
    chapters: list[dict] = []
    if chapter_id:
        preview_audio = media_entry(order, "preview_audio")
        full_audio = media_entry(order, "full_recording")
        audio_entry = full_audio if kept else preview_audio
        audio_url = f"{SITE_URL}/media/{order['sponsor_token']}/{audio_entry['kind']}" if audio_entry else None
        full_text = order.get("chapter_text") if kept in {"story", "heirloom"} else None
        preview_text = str(order.get("preview_excerpt") or "Your representative private preview is ready. Open the project for the source-linked passage and edition choices.")
        chapters.append({
            "id": chapter_id,
            "number": int(order.get("chapter_number", 1)),
            "title": str(order.get("chapter_title") or f"{subject}'s first story"),
            "dek": str(order.get("chapter_dek") or "A StorySitting family record"),
            "previewText": preview_text,
            "fullText": full_text,
            "pullQuote": str(order.get("pull_quote") or preview_text[:180]),
            "recordedAt": _iso8601(order.get("interview_ended_at") or order.get("updated_at") or created),
            "access": "unlocked" if kept else "preview",
            "audio": {
                "durationSeconds": int(order.get("audio_duration_seconds", 0)),
                "previewSeconds": int(order.get("preview_duration_seconds", 0)),
                "audioURL": audio_url,
            },
            "resultEdition": kept,
        })
    phone = str(intake.get("subject_phone_normalized") or intake.get("subject_phone") or "")
    call = {
        "id": f"call_{order['order_id']}_1",
        "sequence": 1,
        "status": call_status,
        "storyStartPurchaseDate": _iso8601(created),
        "storytellerPermission": {
            "status": permission_status,
            "familyPassIssuedAt": _iso8601(created),
            "familyPassRespondedAt": _iso8601(responded),
            "managedHumanCheckAt": _iso8601(human_checked),
            "managedHumanContactDirection": order.get("managed_human_contact_direction"),
            "identityVerifiedAt": _iso8601(identity_verified),
            "permissionGrantedAt": _iso8601(permission_granted),
        },
        "scheduledFor": _iso8601(scheduled_for),
        "interviewConsent": {
            "status": "granted" if order.get("recording_consent_at") else "notRequested",
            "respondedAt": _iso8601(order.get("recording_consent_at")),
            "disclosure": "This is StorySitting. You previously gave us permission to arrange this interview. Before we begin: I’m an AI-assisted interviewer, and this interview will be recorded to create a private family story. Is it okay to continue?",
        },
        "interviewStartedAt": _iso8601(order.get("interview_started_at")),
        "interviewEndedAt": _iso8601(order.get("interview_ended_at")),
        "selectedQuestionIDs": [question["id"] for question in _mobile_questions(order) if question.get("isSelected")],
        "chapterID": chapter_id,
        "chapterPurchaseDate": _iso8601(order.get("result_paid_at")),
    }
    return {
        "id": order["order_id"],
        "title": f"{subject}'s stories",
        "organizerName": str(intake.get("buyer_name") or "Family organizer"),
        "storyteller": {
            "id": f"storyteller_{order['order_id']}",
            "name": subject,
            "familiarName": subject,
            "relationship": _mobile_relationship(intake.get("relationship"), subject),
            "phoneLastFour": re.sub(r"\D", "", phone)[-4:] or "—",
            "birthYear": None,
        },
        "chapters": chapters,
        "calls": [call],
        "questions": _mobile_questions(order),
        "accentSeed": int(hashlib.sha256(order["order_id"].encode()).hexdigest()[:4], 16) % 9,
    }


def mobile_account(email: str, orders: list[dict]) -> dict:
    intake = orders[0].get("intake") or {}
    return {
        "apiVersion": 1,
        "organizer": {
            "id": f"organizer_{hashlib.sha256(email.encode()).hexdigest()[:16]}",
            "name": str(intake.get("buyer_name") or "Family organizer"),
            "email": email,
            "role": _mobile_role(intake.get("relationship")),
        },
        "projects": [mobile_project(order) for order in orders],
    }


def _purchase_intent_path(app_account_token: str) -> Path:
    return _account_record_path(PURCHASE_INTENTS_DIR, app_account_token.lower())


def _storekit_transaction_path(transaction_id: str) -> Path:
    return _account_record_path(STOREKIT_TRANSACTIONS_DIR, transaction_id)


def _purchase_intent_payload(intent: dict) -> dict:
    return {
        "id": intent["id"],
        "appAccountToken": intent["app_account_token"],
        "request": intent["request"],
        "createdAt": _iso8601(intent["created_at"]),
        "status": intent.get("status", "pending"),
        "fulfilledTransactionID": intent.get("fulfilled_transaction_id"),
    }


def create_storekit_purchase_intent(email: str, request: dict) -> dict:
    purchase = str(request.get("purchase") or "")
    product = STOREKIT_PRODUCTS.get(purchase)
    project_id = str(request.get("projectID") or "")
    chapter_id = request.get("chapterID")
    selected = request.get("selectedQuestionIDs") or []
    acknowledged = bool(request.get("sponsorAcknowledgedHandshake"))
    if not product or not re.fullmatch(r"ss_[a-f0-9]{18}", project_id):
        raise ValueError("invalid_purchase_intent")
    if not isinstance(selected, list) or len(selected) > 50 or any(not isinstance(item, str) for item in selected):
        raise ValueError("invalid_question_selection")
    order = next((item for item in find_orders_by_email(email) if item.get("order_id") == project_id), None)
    if not order:
        raise LookupError("project_not_found")
    if purchase == "storyStart":
        if not acknowledged or chapter_id is not None:
            raise ValueError("story_start_handshake_required")
        phone = (order.get("intake") or {}).get("subject_phone_normalized")
        if is_do_not_call(phone):
            raise ValueError("storyteller_do_not_call")
    else:
        target = str(product["target"])
        current = active_result_offer_id(order)
        if str(chapter_id or "") != f"chapter_{project_id}":
            raise ValueError("chapter_not_found")
        if order.get("status") not in {"preview_ready", "result_checkout_pending", "result_kept"}:
            raise ValueError("preview_not_ready")
        if not result_offer_ready(order, target):
            raise ValueError("delivery_not_ready")
        if product["source"] != current:
            raise ValueError("edition_source_mismatch")
        if int(product["price_cents"]) != int(RESULT_OFFERS[target]["price_cents"]) - result_paid_total_cents(order):
            raise ValueError("edition_price_mismatch")

    now = int(time.time())
    app_account_token = str(uuid.uuid4()).lower()
    clean_request = {
        "purchase": purchase,
        "projectID": project_id,
        "chapterID": chapter_id,
        "selectedQuestionIDs": selected,
        "sponsorAcknowledgedHandshake": acknowledged,
    }
    intent = {
        "id": "ski_" + secrets.token_hex(12),
        "app_account_token": app_account_token,
        "email": email,
        "request": clean_request,
        "product_id": product["product_id"],
        "price_cents": product["price_cents"],
        "created_at": now,
        "expires_at": now + 24 * 60 * 60,
        "status": "pending",
    }
    atomic_write(_purchase_intent_path(app_account_token), intent)
    return _purchase_intent_payload(intent)


def _apple_storekit_module():
    """Load Apple's official verifier lazily so the storefront can boot fail-closed."""
    import importlib.util
    module_path = Path(__file__).with_name("apple_storekit.py")
    spec = importlib.util.spec_from_file_location("storysitting_apple_storekit", module_path)
    if not spec or not spec.loader:
        raise RuntimeError("app_store_verifier_unavailable")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def verify_storekit_transaction(signed_transaction_jws: str) -> dict:
    return _apple_storekit_module().verify_transaction(signed_transaction_jws)


def verify_storekit_notification(signed_notification_jws: str) -> dict:
    return _apple_storekit_module().verify_notification(signed_notification_jws)


def process_storekit_notification(signed_notification_jws: str) -> bool:
    verified = verify_storekit_notification(signed_notification_jws)
    event_id = str(verified.get("notification_uuid") or "")
    if not event_id:
        raise ValueError("apple_notification_id_missing")
    event_path = _account_record_path(APPLE_EVENTS_DIR, event_id)
    if event_path.exists():
        return True
    notification_type = str(verified.get("notification_type") or "")
    transaction = verified.get("transaction") or {}
    transaction_id = str(transaction.get("transaction_id") or "")
    if notification_type in {"REFUND", "REVOKE"} or transaction.get("revocation_date") is not None:
        try:
            transaction_record = json.loads(_storekit_transaction_path(transaction_id).read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return False
        order = read_order(str(transaction_record.get("result_order_id") or ""))
        if not order:
            return False
        with ORDER_LOCK:
            if order.get("storekit_transaction_id") == transaction_id:
                order["payment_revoked_at"] = int(time.time())
                order["payment_revocation_reason"] = notification_type.lower()
                order["status"] = "closed"
            for payment in order.get("result_payments", []):
                if str(payment.get("storekit_transaction_id")) == transaction_id:
                    payment["status"] = "revoked"
                    payment["revoked_at"] = int(time.time())
                    payment["revocation_reason"] = notification_type.lower()
            refresh_result_entitlement(order)
            write_order(order)
    atomic_write(event_path, {
        "notification_uuid": event_id,
        "notification_type": notification_type,
        "subtype": verified.get("subtype"),
        "transaction_id": transaction_id or None,
        "processed_at": int(time.time()),
    })
    return True


def fulfill_storekit_purchase(email: str, payload: dict) -> dict:
    transaction_id = str(payload.get("transactionID") or "")
    original_transaction_id = str(payload.get("originalTransactionID") or "")
    product_id = str(payload.get("productID") or "")
    app_account_token = str(payload.get("appAccountToken") or "").lower()
    signed_jws = str(payload.get("signedTransactionJWS") or "")
    if (
        not re.fullmatch(r"[1-9][0-9]{0,24}", transaction_id)
        or not re.fullmatch(r"[1-9][0-9]{0,24}", original_transaction_id)
        or not re.fullmatch(r"[0-9a-f-]{36}", app_account_token)
        or len(signed_jws) < 100
    ):
        raise ValueError("invalid_storekit_proof")
    try:
        intent = json.loads(_purchase_intent_path(app_account_token).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        raise LookupError("purchase_intent_not_found")
    if intent.get("email") != email or intent.get("product_id") != product_id:
        raise ValueError("purchase_intent_mismatch")
    if int(time.time()) > int(intent.get("expires_at", 0)) and intent.get("status") != "fulfilled":
        raise ValueError("purchase_intent_expired")

    transaction_path = _storekit_transaction_path(transaction_id)
    try:
        existing = json.loads(transaction_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        existing = None
    if existing:
        if existing.get("app_account_token") != app_account_token:
            raise ValueError("transaction_already_bound")
        result_order = read_order(str(existing.get("result_order_id") or ""))
        if not result_order:
            raise RuntimeError("fulfilled_project_missing")
        return mobile_project(result_order)

    verified = verify_storekit_transaction(signed_jws)
    if (
        str(verified.get("transaction_id")) != transaction_id
        or str(verified.get("original_transaction_id")) != original_transaction_id
        or str(verified.get("product_id")) != product_id
        or str(verified.get("app_account_token") or "").lower() != app_account_token
        or verified.get("revocation_date") is not None
    ):
        raise ValueError("storekit_verification_mismatch")

    with ORDER_LOCK:
        request = intent["request"]
        source_order = next(
            (item for item in find_orders_by_email(email) if item.get("order_id") == request.get("projectID")),
            None,
        )
        if not source_order:
            raise LookupError("project_not_found")
        purchase = str(request["purchase"])
        product = STOREKIT_PRODUCTS[purchase]
        if purchase == "storyStart":
            intake = dict(source_order.get("intake") or {})
            if is_do_not_call(intake.get("subject_phone_normalized")):
                raise ValueError("storyteller_do_not_call")
            order = {
                "order_id": "ss_" + secrets.token_hex(9),
                "created_at": int(time.time()),
                "paid_at": int(time.time()),
                "updated_at": int(time.time()),
                "status": "permission_pending",
                "start_payment_status": "paid",
                "payment_channel": "storekit",
                "storekit_transaction_id": transaction_id,
                "storekit_original_transaction_id": original_transaction_id,
                "parent_order_id": source_order["order_id"],
                "intake": intake,
                "story_seeds": request.get("selectedQuestionIDs") or [],
                "sponsor_token": secrets.token_urlsafe(30),
                "permission_token": secrets.token_urlsafe(30),
                "permission_code": f"{secrets.randbelow(1_000_000):06d}",
                "permission_status": "waiting_for_storyteller",
                "amount_start_cents": 500,
            }
            write_order(order)
            try:
                send_project_access_email(order)
            except Exception as error:
                order["access_email_error"] = type(error).__name__
                write_order(order)
        else:
            order = source_order
            target = str(product["target"])
            current = active_result_offer_id(order)
            if product["source"] != current or not result_offer_ready(order, target):
                raise ValueError("edition_state_changed")
            expected = int(RESULT_OFFERS[target]["price_cents"]) - result_paid_total_cents(order)
            if expected != int(product["price_cents"]):
                raise ValueError("edition_price_changed")
            payments = order.setdefault("result_payments", [])
            existing_payment = next(
                (item for item in payments if str(item.get("storekit_transaction_id")) == transaction_id),
                None,
            )
            if not existing_payment:
                payments.append({
                    "storekit_transaction_id": transaction_id,
                    "storekit_original_transaction_id": original_transaction_id,
                    "offer_id": target,
                    "amount_cents": int(product["price_cents"]),
                    "status": "paid",
                    "paid_at": int(time.time()),
                    "channel": "storekit",
                })
            refresh_result_entitlement(order)
            write_order(order)

        intent["status"] = "fulfilled"
        intent["fulfilled_transaction_id"] = transaction_id
        intent["fulfilled_at"] = int(time.time())
        intent["result_order_id"] = order["order_id"]
        atomic_write(_purchase_intent_path(app_account_token), intent)
        atomic_write(transaction_path, {
            "transaction_id": transaction_id,
            "original_transaction_id": original_transaction_id,
            "product_id": product_id,
            "app_account_token": app_account_token,
            "intent_id": intent["id"],
            "result_order_id": order["order_id"],
            "environment": verified.get("environment"),
            "fulfilled_at": int(time.time()),
        })
        return mobile_project(order)


class Handler(BaseHTTPRequestHandler):
    server_version = "storysitting/5.0"

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

    def _send(self, status: int, body: str | bytes | dict | list, content_type: str = "text/html; charset=utf-8") -> None:
        if isinstance(body, (dict, list)):
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

    def _redirect_with_session(self, location: str, token: str) -> None:
        self.send_response(HTTPStatus.SEE_OTHER)
        self.send_header("Location", location)
        self.send_header(
            "Set-Cookie",
            f"ss_session={token}; Path=/; Max-Age={ACCOUNT_SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Lax",
        )
        self._security_headers()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _logout_redirect(self) -> None:
        self.send_response(HTTPStatus.SEE_OTHER)
        self.send_header("Location", "/account/")
        self.send_header("Set-Cookie", "ss_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax")
        self._security_headers()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _session_token(self) -> str | None:
        authorization = self.headers.get("Authorization", "")
        if authorization.startswith("Bearer "):
            candidate = authorization[7:].strip()
            return candidate if TOKEN_RE.fullmatch(candidate) else None
        try:
            cookies = SimpleCookie(self.headers.get("Cookie", ""))
            candidate = cookies.get("ss_session").value if cookies.get("ss_session") else ""
        except Exception:
            return None
        return candidate if TOKEN_RE.fullmatch(candidate) else None

    def _account_email(self) -> str | None:
        return account_email_for_session(self._session_token())

    def _mobile_orders(self) -> tuple[str, list[dict]] | None:
        email = self._account_email()
        if not email:
            return None
        return email, find_orders_by_email(email)

    def _send_media(self, order: dict, entry: dict) -> None:
        relative = str(entry.get("path", ""))
        if not relative or relative.startswith("/") or ".." in Path(relative).parts or any(ord(character) < 32 for character in relative):
            return self._send(404, {"error": "not found"})
        safe_path = "/".join(urllib.parse.quote(part, safe="") for part in Path(relative).parts)
        content_type = str(entry.get("content_type") or "application/octet-stream")
        if not re.fullmatch(r"[a-z0-9.+-]+/[a-z0-9.+-]+", content_type, re.I):
            content_type = "application/octet-stream"
        inline = entry.get("kind") == "preview_audio"
        filename = Path(relative).name.replace('"', "")
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Disposition", f'{"inline" if inline else "attachment"}; filename="{filename}"')
        self.send_header("X-Accel-Redirect", f"/_private_delivery/{order['order_id']}/{safe_path}")
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
        if path in {"/healthz", "/api/healthz"}:
            return self._send(200, {"ok": True, "version": 5, "accountApi": 1})
        if path == "/account":
            if self._account_email():
                return self._redirect("/dashboard/")
            return self._send(200, account_login_page())
        if path == "/dashboard":
            email = self._account_email()
            if not email:
                return self._redirect("/account/")
            return self._send(200, account_dashboard_page(email, find_orders_by_email(email)))
        if path in {"/api/v1/account", "/api/v1/projects"}:
            account = self._mobile_orders()
            if not account:
                return self._send(401, {"error": "authentication_required"})
            email, orders = account
            payload = mobile_account(email, orders)
            return self._send(200, payload if path == "/api/v1/account" else payload["projects"])
        if path.startswith("/api/v1/projects/"):
            account = self._mobile_orders()
            if not account:
                return self._send(401, {"error": "authentication_required"})
            _, orders = account
            order_id = path.split("/", 4)[4]
            order = next((item for item in orders if item.get("order_id") == order_id), None)
            if not order:
                return self._send(404, {"error": "project_not_found"})
            return self._send(200, mobile_project(order))
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
        if path.startswith("/media/"):
            parts = path.split("/")
            if len(parts) != 4:
                return self._send(404, {"error": "not found"})
            order = find_order_by("sponsor_token", parts[2])
            entry = media_entry(order, parts[3]) if order and _status_is_paid(order) else None
            if not order or not entry:
                return self._send(404, {"error": "not found"})
            return self._send_media(order, entry)
        return self._send(404, {"error": "not found"})

    def do_POST(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        try:
            if path == "/api/webhooks/apple":
                signed_payload = str(self._json_body().get("signedPayload") or "")
                if len(signed_payload) < 100 or len(signed_payload) > 60_000:
                    return self._send(400, {"error": "invalid_signed_payload"})
                try:
                    processed = process_storekit_notification(signed_payload)
                except (ValueError, RuntimeError) as error:
                    print(f"ERROR Apple notification: {error}", flush=True)
                    return self._send(503, {"error": "verification_unavailable"})
                return self._send(200 if processed else 503, {"ok": processed})
            if path in {"/account/request-code", "/api/v1/auth/request-code"}:
                payload = self._json_body() if path.startswith("/api/") else self._form_body()
                email = normalize_email(payload.get("email"))
                rate_identity = hashlib.sha256(str(email or "invalid").encode()).hexdigest()[:20]
                if not allow_request(self._client_key(f"account-code:{rate_identity}"), 5, 60 * 60):
                    if path.startswith("/api/"):
                        return self._send(429, {"error": "try_again_later"})
                    return self._send(429, account_login_page("Please wait before requesting another code."))
                if not email:
                    if path.startswith("/api/"):
                        return self._send(202, {"ok": True})
                    return self._send(400, account_login_page("Enter a valid email address."))
                try:
                    request_account_code(email)
                except Exception as error:
                    print(f"ERROR account mail: {type(error).__name__}", flush=True)
                    if path.startswith("/api/"):
                        return self._send(503, {"error": "email_temporarily_unavailable"})
                    return self._send(503, account_login_page("Email is temporarily unavailable. Please try again shortly."))
                if path.startswith("/api/"):
                    return self._send(202, {"ok": True, "expiresIn": ACCOUNT_CODE_TTL_SECONDS})
                return self._send(200, account_code_page(email))
            if path in {"/account/verify-code", "/api/v1/auth/verify-code"}:
                payload = self._json_body() if path.startswith("/api/") else self._form_body()
                email = normalize_email(payload.get("email"))
                if not allow_request(self._client_key(f"account-verify:{email or 'invalid'}"), 12, 60 * 60):
                    if path.startswith("/api/"):
                        return self._send(429, {"error": "try_again_later"})
                    return self._send(429, account_code_page(email or "", "Please wait before trying another code."))
                token = verify_account_code(email, payload.get("code"))
                if not token:
                    if path.startswith("/api/"):
                        return self._send(401, {"error": "invalid_or_expired_code"})
                    return self._send(401, account_code_page(email or "", "That code is incorrect or expired."))
                if path.startswith("/api/"):
                    orders = find_orders_by_email(email or "")
                    return self._send(200, {
                        "token": token,
                        "expiresIn": ACCOUNT_SESSION_TTL_SECONDS,
                        "account": mobile_account(email or "", orders),
                    })
                return self._redirect_with_session("/dashboard/", token)
            if path in {"/account/logout", "/api/v1/auth/logout"}:
                token = self._session_token()
                revoke_account_session(token)
                if path.startswith("/api/"):
                    return self._send(204, b"")
                return self._logout_redirect()
            if path.startswith("/api/v1/projects/") and path.endswith("/questions/selection"):
                account = self._mobile_orders()
                if not account:
                    return self._send(401, {"error": "authentication_required"})
                _, orders = account
                order_id = path.split("/")[4]
                order = next((item for item in orders if item.get("order_id") == order_id), None)
                if not order:
                    return self._send(404, {"error": "project_not_found"})
                payload = self._json_body()
                selected = payload.get("selectedIDs")
                if not isinstance(selected, list) or len(selected) > 50 or any(not isinstance(item, str) for item in selected):
                    return self._send(400, {"error": "invalid_question_selection"})
                chosen = set(selected)
                with ORDER_LOCK:
                    questions = _mobile_questions(order)
                    for question in questions:
                        question["isSelected"] = question.get("id") in chosen
                    order["family_questions"] = questions
                    write_order(order)
                return self._send(200, mobile_project(order))
            if path.startswith("/api/v1/projects/") and path.endswith("/questions"):
                account = self._mobile_orders()
                if not account:
                    return self._send(401, {"error": "authentication_required"})
                _, orders = account
                order_id = path.split("/")[4]
                order = next((item for item in orders if item.get("order_id") == order_id), None)
                if not order:
                    return self._send(404, {"error": "project_not_found"})
                payload = self._json_body()
                prompt = str(payload.get("prompt") or "").strip()
                category = str(payload.get("category") or "wisdom")
                if len(prompt) < 5 or len(prompt) > 500 or category not in {"beginnings", "home", "traditions", "turningPoints", "people", "wisdom"}:
                    return self._send(400, {"error": "invalid_question"})
                with ORDER_LOCK:
                    questions = _mobile_questions(order)
                    questions.append({
                        "id": f"q_custom_{secrets.token_hex(8)}",
                        "prompt": prompt,
                        "category": category,
                        "isSelected": True,
                        "answeredInChapterID": None,
                        "submittedBy": str((order.get("intake") or {}).get("buyer_name") or "Family"),
                    })
                    order["family_questions"] = questions
                    write_order(order)
                return self._send(200, mobile_project(order))
            if path == "/api/v1/purchases/intents":
                email = self._account_email()
                if not email:
                    return self._send(401, {"error": "authentication_required"})
                try:
                    with ORDER_LOCK:
                        intent = create_storekit_purchase_intent(email, self._json_body())
                    return self._send(200, intent)
                except LookupError as error:
                    return self._send(404, {"error": str(error)})
                except ValueError as error:
                    return self._send(409, {"error": str(error)})
            if path == "/api/v1/purchases/fulfill":
                email = self._account_email()
                if not email:
                    return self._send(401, {"error": "authentication_required"})
                try:
                    project = fulfill_storekit_purchase(email, self._json_body())
                    return self._send(200, project)
                except LookupError as error:
                    return self._send(404, {"error": str(error)})
                except ValueError as error:
                    return self._send(409, {"error": str(error)})
                except RuntimeError as error:
                    print(f"ERROR StoreKit fulfillment: {error}", flush=True)
                    return self._send(503, {"error": "app_store_verification_unavailable"})
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
                    status, result = start_result_checkout(order, str(form.get("offer_id") or "story"))
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
    print(f"storysitting storefront v4 on 127.0.0.1:{PORT} site={SITE_URL}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
