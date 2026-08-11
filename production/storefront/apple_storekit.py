"""Apple-signed StoreKit transaction verification for StorySitting.

This module uses Apple's official App Store Server Library. It is deliberately
loaded only at fulfillment time so missing Apple configuration fails purchases
closed without taking down the sponsor dashboard.
"""

from __future__ import annotations

import os
from pathlib import Path


BUNDLE_ID = "com.amflimited.storysitting"
ROOTS_DIR = Path(os.environ.get("SS_APPLE_ROOT_CERTS_DIR", "/etc/storysitting/apple-root-certs"))


def _roots() -> list[bytes]:
    roots = [path.read_bytes() for path in sorted(ROOTS_DIR.glob("*.cer")) if path.is_file()]
    if not roots:
        raise RuntimeError("apple_root_certificates_missing")
    return roots


def _value(payload: object, name: str):
    value = getattr(payload, name, None)
    return value.value if hasattr(value, "value") else value


def _verifiers():
    try:
        from appstoreserverlibrary.models.Environment import Environment
        from appstoreserverlibrary.signed_data_verifier import SignedDataVerifier, VerificationException
    except ImportError as error:
        raise RuntimeError("apple_server_library_missing") from error

    roots = _roots()
    app_apple_id = os.environ.get("SS_APPLE_APP_ID", "").strip()
    attempts = []
    if app_apple_id.isdigit():
        attempts.append((Environment.PRODUCTION, int(app_apple_id)))
    attempts.append((Environment.SANDBOX, None))

    for environment, apple_id in attempts:
        yield SignedDataVerifier(roots, True, environment, BUNDLE_ID, apple_id), VerificationException


def verify_transaction(signed_transaction_jws: str) -> dict:
    last_error: Exception | None = None
    for verifier, verification_exception in _verifiers():
        try:
            payload = verifier.verify_and_decode_transaction(signed_transaction_jws)
            return {
                "transaction_id": str(_value(payload, "transactionId") or ""),
                "original_transaction_id": str(_value(payload, "originalTransactionId") or ""),
                "product_id": str(_value(payload, "productId") or ""),
                "app_account_token": str(_value(payload, "appAccountToken") or "").lower(),
                "revocation_date": _value(payload, "revocationDate"),
                "purchase_date": _value(payload, "purchaseDate"),
                "signed_date": _value(payload, "signedDate"),
                "environment": str(_value(payload, "environment") or ""),
            }
        except verification_exception as error:
            last_error = error
    raise ValueError("apple_transaction_verification_failed") from last_error


def verify_notification(signed_notification_jws: str) -> dict:
    last_error: Exception | None = None
    for verifier, verification_exception in _verifiers():
        try:
            payload = verifier.verify_and_decode_notification(signed_notification_jws)
            data = getattr(payload, "data", None)
            signed_transaction = getattr(data, "signedTransactionInfo", None) if data else None
            transaction = verify_transaction(signed_transaction) if signed_transaction else None
            return {
                "notification_uuid": str(_value(payload, "notificationUUID") or ""),
                "notification_type": str(_value(payload, "notificationType") or ""),
                "subtype": str(_value(payload, "subtype") or ""),
                "transaction": transaction,
            }
        except verification_exception as error:
            last_error = error
    raise ValueError("apple_notification_verification_failed") from last_error
