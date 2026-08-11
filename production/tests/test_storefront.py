import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


MODULE_PATH = Path(__file__).parents[1] / "storefront" / "app.py"
SPEC = importlib.util.spec_from_file_location("storysitting_storefront", MODULE_PATH)
storefront = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(storefront)


class StorefrontJourneyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        base = Path(self.temp.name)
        storefront.BASE_DIR = base
        storefront.ORDERS_DIR = base / "orders-v2"
        storefront.IDEMPOTENCY_DIR = base / "idempotency-v2"
        storefront.DNC_DIR = base / "do-not-call-v2"
        storefront.ACCOUNT_CODES_DIR = base / "account-codes-v1"
        storefront.ACCOUNT_SESSIONS_DIR = base / "account-sessions-v1"
        storefront.PURCHASE_INTENTS_DIR = base / "storekit-intents-v1"
        storefront.STOREKIT_TRANSACTIONS_DIR = base / "storekit-transactions-v1"
        storefront.APPLE_EVENTS_DIR = base / "apple-events-v1"
        storefront.PRICES_CONF = base / "stripe-prices.conf"
        storefront.PRICES_CONF.write_text("PRICE_START=price_start\nPRICE_CALL=price_result\n", encoding="utf-8")
        storefront._ensure_dirs()
        self.calls = []
        self.sessions = {}

        def fake_stripe(method, path, params=None, *, idempotency_key=None):
            self.calls.append((method, path, params, idempotency_key))
            if path == "/customers":
                return True, {"id": "cus_test"}
            if method == "POST" and path == "/checkout/sessions":
                kind = (params or {}).get("metadata", {}).get("kind")
                suffix = "start" if kind == "story_start" else f"result_{params['metadata'].get('offer_id', 'story')}"
                session = {
                    "id": f"cs_{suffix}",
                    "url": f"https://checkout.stripe.test/{suffix}",
                    "status": "open",
                    "payment_status": "unpaid",
                    "metadata": (params or {}).get("metadata", {}),
                    "amount_total": ((params or {}).get("line_items") or [{}])[0].get("price_data", {}).get("unit_amount"),
                }
                self.sessions[session["id"]] = session
                return True, session
            if method == "POST" and path.endswith("/expire"):
                session_id = path.split("/checkout/sessions/", 1)[1].rsplit("/expire", 1)[0]
                self.sessions[session_id]["status"] = "expired"
                return True, self.sessions[session_id]
            if method == "POST" and path == "/refunds":
                return True, {"id": "re_test", "status": "succeeded"}
            if method == "GET" and path.startswith("/checkout/sessions/cs_start"):
                return True, {"id": "cs_start", "payment_status": "paid", "metadata": {"order_id": self.order_id, "kind": "story_start"}, "payment_intent": {"id": "pi_start"}}
            if method == "GET" and path.startswith("/checkout/sessions/"):
                session_id = path.split("/checkout/sessions/", 1)[1].split("?", 1)[0]
                if session_id in self.sessions:
                    return True, self.sessions[session_id]
            raise AssertionError(f"unexpected Stripe call: {method} {path}")

        self.real_stripe_call = storefront.stripe_call
        self.real_send_account_email = storefront.send_account_email
        self.real_verify_storekit_transaction = storefront.verify_storekit_transaction
        self.real_verify_storekit_notification = storefront.verify_storekit_notification
        storefront.stripe_call = fake_stripe
        self.emails = []
        storefront.send_account_email = lambda recipient, subject, text: self.emails.append((recipient, subject, text))
        self.payload = {
            "buyer_name": "Maya Sponsor",
            "buyer_email": "Maya@example.com",
            "relationship": "Granddaughter",
            "subject_name": "Grandpa Ray",
            "subject_phone": "317-555-0142",
            "best_times": "Weekday mornings",
            "capture": "How he met Lorraine",
            "personal_introduction": "I would love to keep one ordinary story.",
            "consent": True,
        }

    def tearDown(self):
        storefront.stripe_call = self.real_stripe_call
        storefront.send_account_email = self.real_send_account_email
        storefront.verify_storekit_transaction = self.real_verify_storekit_transaction
        storefront.verify_storekit_notification = self.real_verify_storekit_notification
        self.temp.cleanup()

    def start_order(self):
        status, response = storefront.handle_start(self.payload, "browser-request-1")
        self.assertEqual(status, 200)
        order_files = list(storefront.ORDERS_DIR.glob("*.json"))
        self.assertEqual(len(order_files), 1)
        order = json.loads(order_files[0].read_text(encoding="utf-8"))
        self.order_id = order["order_id"]
        return order, response

    def pay_order(self, order):
        self.order_id = order["order_id"]
        ok, message = storefront.confirm_start_payment(order, "cs_start")
        self.assertTrue(ok, message)
        return storefront.read_order(order["order_id"])

    def test_start_is_idempotent_and_never_saves_card_for_later(self):
        order, response = self.start_order()
        status, repeated = storefront.handle_start(self.payload, "browser-request-1")
        self.assertEqual(status, 200)
        self.assertEqual(repeated["url"], response["url"])
        checkout = next(call for call in self.calls if call[0:2] == ("POST", "/checkout/sessions"))
        params = checkout[2]
        self.assertNotIn("payment_intent_data", params)
        self.assertEqual(params["payment_method_types"], ["card"])
        self.assertEqual(order["intake"]["personal_introduction"], self.payload["personal_introduction"])
        self.assertEqual(order["status"], "awaiting_payment")

    def test_paid_receipt_is_bound_to_exact_session(self):
        order, _ = self.start_order()
        ok, _ = storefront.confirm_start_payment(order, "cs_someone_elses")
        self.assertFalse(ok)
        unchanged = storefront.read_order(order["order_id"])
        self.assertEqual(unchanged["start_payment_status"], "unpaid")
        paid = self.pay_order(unchanged)
        self.assertEqual(paid["start_payment_status"], "paid")
        self.assertEqual(paid["status"], "permission_pending")
        self.assertEqual(len(self.emails), 1)
        self.assertIn("StorySitting is open", self.emails[0][1])

    def test_passwordless_account_code_opens_only_the_matching_paid_shelf(self):
        order, _ = self.start_order()
        paid = self.pay_order(order)
        self.emails.clear()

        self.assertTrue(storefront.request_account_code("MAYA@example.com"))
        self.assertEqual(len(self.emails), 1)
        code = self.emails[0][1].rsplit(" ", 1)[-1]
        self.assertIsNone(storefront.verify_account_code("maya@example.com", "000000" if code != "000000" else "999999"))
        token = storefront.verify_account_code("maya@example.com", code)
        self.assertIsNotNone(token)
        self.assertEqual(storefront.account_email_for_session(token), "maya@example.com")

        projects = storefront.find_orders_by_email("maya@example.com")
        self.assertEqual([item["order_id"] for item in projects], [paid["order_id"]])
        account = storefront.mobile_account("maya@example.com", projects)
        self.assertEqual(account["apiVersion"], 1)
        self.assertEqual(account["projects"][0]["id"], paid["order_id"])
        self.assertEqual(account["projects"][0]["calls"][0]["status"], "awaitingFamilyPassResponse")

        storefront.revoke_account_session(token)
        self.assertIsNone(storefront.account_email_for_session(token))

    def test_account_request_does_not_enumerate_unknown_email(self):
        self.assertTrue(storefront.request_account_code("nobody@example.com"))
        self.assertEqual(self.emails, [])

    def test_isolated_app_review_login_uses_fixed_code_without_email(self):
        order, _ = self.start_order()
        self.pay_order(order)
        self.emails.clear()

        with patch.dict(os.environ, {
            "SS_APP_REVIEW_EMAIL": "reviewer@storysitting.com",
            "SS_APP_REVIEW_CODE": "482731",
        }):
            paid = storefront.read_order(order["order_id"])
            paid["intake"]["buyer_email"] = "reviewer@storysitting.com"
            storefront.write_order(paid)

            self.assertTrue(storefront.request_account_code("reviewer@storysitting.com"))
            self.assertEqual(self.emails, [])
            self.assertIsNone(storefront.verify_account_code("reviewer@storysitting.com", "482730"))
            token = storefront.verify_account_code("reviewer@storysitting.com", "482731")
            self.assertIsNotNone(token)
            self.assertEqual(storefront.account_email_for_session(token), "reviewer@storysitting.com")

    def test_storekit_result_fulfillment_is_server_bound_and_idempotent(self):
        order, _ = self.start_order()
        paid = self.pay_order(order)
        paid.update({
            "status": "preview_ready",
            "result_manifest_ready": True,
            "result_manifest": {"files": [
                {"kind": kind, "path": f"{kind}.dat", "label": kind}
                for kind in storefront.BASE_DELIVERY_KINDS
            ]},
        })
        storefront.write_order(paid)
        intent = storefront.create_storekit_purchase_intent("maya@example.com", {
            "purchase": "storyEdition",
            "projectID": paid["order_id"],
            "chapterID": f"chapter_{paid['order_id']}",
            "selectedQuestionIDs": [],
            "sponsorAcknowledgedHandshake": False,
        })
        transaction_id = "9007199254740993123"
        payload = {
            "transactionID": transaction_id,
            "originalTransactionID": transaction_id,
            "productID": "com.amflimited.storysitting.result.story",
            "appAccountToken": intent["appAccountToken"],
            "signedTransactionJWS": "eyJ" + "a" * 160,
        }
        storefront.verify_storekit_transaction = lambda _jws: {
            "transaction_id": transaction_id,
            "original_transaction_id": transaction_id,
            "product_id": payload["productID"],
            "app_account_token": intent["appAccountToken"],
            "revocation_date": None,
            "environment": "Sandbox",
        }
        project = storefront.fulfill_storekit_purchase("maya@example.com", payload)
        self.assertEqual(project["chapters"][0]["resultEdition"], "story")
        replay = storefront.fulfill_storekit_purchase("maya@example.com", payload)
        self.assertEqual(replay["id"], project["id"])
        saved = storefront.read_order(paid["order_id"])
        self.assertEqual(len(saved["result_payments"]), 1)
        self.assertEqual(saved["result_payments"][0]["storekit_transaction_id"], transaction_id)

    def test_storekit_story_start_creates_a_new_independent_permission_path(self):
        order, _ = self.start_order()
        paid = self.pay_order(order)
        intent = storefront.create_storekit_purchase_intent("maya@example.com", {
            "purchase": "storyStart",
            "projectID": paid["order_id"],
            "chapterID": None,
            "selectedQuestionIDs": [],
            "sponsorAcknowledgedHandshake": True,
        })
        transaction_id = "9007199254740993999"
        payload = {
            "transactionID": transaction_id,
            "originalTransactionID": transaction_id,
            "productID": "com.amflimited.storysitting.story.start",
            "appAccountToken": intent["appAccountToken"],
            "signedTransactionJWS": "eyJ" + "b" * 160,
        }
        storefront.verify_storekit_transaction = lambda _jws: {
            "transaction_id": transaction_id,
            "original_transaction_id": transaction_id,
            "product_id": payload["productID"],
            "app_account_token": intent["appAccountToken"],
            "revocation_date": None,
            "environment": "Sandbox",
        }
        project = storefront.fulfill_storekit_purchase("maya@example.com", payload)
        self.assertNotEqual(project["id"], paid["order_id"])
        created = storefront.read_order(project["id"])
        self.assertEqual(created["parent_order_id"], paid["order_id"])
        self.assertEqual(created["status"], "permission_pending")
        self.assertNotEqual(created["permission_token"], paid["permission_token"])

    def test_verified_apple_refund_notification_revokes_result_access(self):
        order, _ = self.start_order()
        paid = self.pay_order(order)
        paid.update({
            "status": "preview_ready",
            "result_manifest_ready": True,
            "result_manifest": {"files": [
                {"kind": kind, "path": f"{kind}.dat", "label": kind}
                for kind in storefront.BASE_DELIVERY_KINDS
            ]},
        })
        storefront.write_order(paid)
        intent = storefront.create_storekit_purchase_intent("maya@example.com", {
            "purchase": "voiceEdition", "projectID": paid["order_id"],
            "chapterID": f"chapter_{paid['order_id']}", "selectedQuestionIDs": [],
            "sponsorAcknowledgedHandshake": False,
        })
        transaction_id = "9007199254740993555"
        proof = {
            "transactionID": transaction_id, "originalTransactionID": transaction_id,
            "productID": "com.amflimited.storysitting.result.voice",
            "appAccountToken": intent["appAccountToken"], "signedTransactionJWS": "eyJ" + "c" * 160,
        }
        storefront.verify_storekit_transaction = lambda _jws: {
            "transaction_id": transaction_id, "original_transaction_id": transaction_id,
            "product_id": proof["productID"], "app_account_token": intent["appAccountToken"],
            "revocation_date": None, "environment": "Sandbox",
        }
        storefront.fulfill_storekit_purchase("maya@example.com", proof)
        storefront.verify_storekit_notification = lambda _jws: {
            "notification_uuid": "d4a8df7d-5c06-4751-92bb-121cf9c2cd34",
            "notification_type": "REFUND", "subtype": "",
            "transaction": {"transaction_id": transaction_id, "revocation_date": 1},
        }
        self.assertTrue(storefront.process_storekit_notification("eyJ" + "d" * 160))
        saved = storefront.read_order(paid["order_id"])
        self.assertIsNone(storefront.active_result_offer_id(saved))
        self.assertEqual(saved["result_payments"][0]["status"], "revoked")
        self.assertTrue(storefront.process_storekit_notification("eyJ" + "d" * 160))

    def test_interested_family_pass_response_stops_at_human_identity_check(self):
        order, _ = self.start_order()
        paid = self.pay_order(order)
        decision = storefront.record_permission_response(paid, {"decision": "interested", "storyteller_name": "Ray", "human_check_preference": "After 10"})
        self.assertEqual(decision, "interested")
        updated = storefront.read_order(order["order_id"])
        self.assertEqual(updated["status"], "identity_pending")
        self.assertEqual(updated["permission_response"], "interested_unverified")
        self.assertNotIn("call_scheduled_at", updated)
        self.assertNotIn("ai_interview_authorized", updated)

    def test_never_call_closes_project_and_records_dnc(self):
        order, _ = self.start_order()
        paid = self.pay_order(order)
        storefront.record_permission_response(paid, {"decision": "never_call"})
        updated = storefront.read_order(order["order_id"])
        self.assertEqual(updated["status"], "permission_declined")
        self.assertTrue(updated.get("do_not_call_recorded_at"))
        self.assertTrue(storefront.is_do_not_call(updated["intake"]["subject_phone_normalized"]))

    def test_result_checkout_requires_verified_delivery_manifest(self):
        order, _ = self.start_order()
        paid = self.pay_order(order)
        paid["status"] = "preview_ready"
        storefront.write_order(paid)
        status, _ = storefront.start_result_checkout(paid)
        self.assertEqual(status, 409)
        paid["result_manifest_ready"] = True
        paid["result_manifest"] = {"files": [
            {"kind": kind, "path": f"{kind}.dat", "label": kind}
            for kind in storefront.BASE_DELIVERY_KINDS
        ]}
        storefront.write_order(paid)
        status, location = storefront.start_result_checkout(paid)
        self.assertEqual(status, 303)
        self.assertEqual(location, "https://checkout.stripe.test/result_story")

    def test_full_media_stays_locked_until_result_is_paid(self):
        order, _ = self.start_order()
        paid = self.pay_order(order)
        paid["status"] = "preview_ready"
        paid["result_manifest"] = {"files": [
            {"kind": kind, "path": f"{kind}.dat"}
            for kind in storefront.BASE_DELIVERY_KINDS
        ]}
        self.assertIsNotNone(storefront.media_entry(paid, "preview_audio"))
        self.assertIsNone(storefront.media_entry(paid, "full_recording"))
        paid["result_manifest_ready"] = True
        paid["status"] = "result_kept"
        paid["result_payments"] = [{"amount_cents": 3900, "status": "paid"}]
        self.assertIsNotNone(storefront.media_entry(paid, "full_recording"))
        self.assertIsNone(storefront.media_entry(paid, "chapter"))
        paid["result_payments"][0]["status"] = "revoked"
        self.assertIsNone(storefront.media_entry(paid, "full_recording"))

    def test_editions_charge_exact_difference_and_unlock_cumulatively(self):
        order, _ = self.start_order()
        paid = self.pay_order(order)
        paid.update({
            "status": "preview_ready",
            "result_manifest_ready": True,
            "result_manifest": {"files": [
                {"kind": kind, "path": f"{kind}.dat", "label": kind}
                for kind in storefront.ALL_DELIVERY_KINDS
            ]},
        })
        storefront.write_order(paid)

        status, _ = storefront.start_result_checkout(paid, "voice")
        self.assertEqual(status, 303)
        voice_session = self.sessions["cs_result_voice"]
        self.assertEqual(voice_session["amount_total"], 3900)
        voice_session.update({"status": "complete", "payment_status": "paid", "payment_intent": {"id": "pi_voice"}})
        ok, message = storefront.confirm_result_payment(paid, "cs_result_voice")
        self.assertTrue(ok, message)
        paid = storefront.read_order(order["order_id"])
        self.assertEqual(paid["result_offer_id"], "voice")

        status, _ = storefront.start_result_checkout(paid, "story")
        self.assertEqual(status, 303)
        story_session = self.sessions["cs_result_story"]
        self.assertEqual(story_session["amount_total"], 4000)
        story_session.update({"status": "complete", "payment_status": "paid", "payment_intent": {"id": "pi_story"}})
        ok, message = storefront.confirm_result_payment(paid, "cs_result_story")
        self.assertTrue(ok, message)
        paid = storefront.read_order(order["order_id"])
        self.assertEqual(paid["result_offer_id"], "story")
        self.assertEqual(paid["result_paid_total_cents"], 7900)

        status, _ = storefront.start_result_checkout(paid, "heirloom")
        self.assertEqual(status, 303)
        self.assertEqual(self.sessions["cs_result_heirloom"]["amount_total"], 7000)

    def test_result_receipt_rejects_wrong_offer_amount_and_replay_is_idempotent(self):
        order, _ = self.start_order()
        paid = self.pay_order(order)
        paid.update({
            "status": "preview_ready",
            "result_manifest_ready": True,
            "result_manifest": {"files": [{"kind": kind, "path": f"{kind}.dat"} for kind in storefront.BASE_DELIVERY_KINDS]},
        })
        storefront.write_order(paid)
        storefront.start_result_checkout(paid, "voice")
        session = self.sessions["cs_result_voice"]
        session.update({"status": "complete", "payment_status": "paid", "payment_intent": {"id": "pi_voice"}, "amount_total": 7900})
        ok, _ = storefront.confirm_result_payment(paid, session["id"])
        self.assertFalse(ok)
        session["amount_total"] = 3900
        ok, _ = storefront.confirm_result_payment(paid, session["id"])
        self.assertTrue(ok)
        paid = storefront.read_order(order["order_id"])
        ok, _ = storefront.confirm_result_payment(paid, session["id"])
        self.assertTrue(ok)
        self.assertEqual(len(storefront.read_order(order["order_id"])["result_payments"]), 1)

    def test_parallel_stale_edition_payment_is_refunded_instead_of_overcharging(self):
        order, _ = self.start_order()
        paid = self.pay_order(order)
        paid.update({
            "status": "preview_ready",
            "result_manifest_ready": True,
            "result_manifest": {"files": [{"kind": kind, "path": f"{kind}.dat"} for kind in storefront.ALL_DELIVERY_KINDS]},
        })
        storefront.write_order(paid)
        storefront.start_result_checkout(paid, "voice")
        voice_session = self.sessions["cs_result_voice"]

        # Simulate a second tab that opened a direct Story Checkout before the
        # Voice payment returned. The now-stale session may still arrive late.
        story_session = {
            "id": "cs_parallel_story",
            "status": "complete",
            "payment_status": "paid",
            "amount_total": 7900,
            "payment_intent": {"id": "pi_parallel_story"},
            "metadata": {
                "order_id": order["order_id"], "kind": "finished_result",
                "attempt_id": "ra_parallel_story", "offer_id": "story", "amount_cents": "7900",
            },
        }
        self.sessions[story_session["id"]] = story_session
        paid["result_checkout_attempts"].append({
            "attempt_id": "ra_parallel_story", "offer_id": "story", "from_paid_cents": 0,
            "amount_cents": 7900, "stripe_checkout_session": story_session["id"], "status": "open",
        })

        voice_session.update({"status": "complete", "payment_status": "paid", "payment_intent": {"id": "pi_voice"}})
        ok, message = storefront.confirm_result_payment(paid, voice_session["id"])
        self.assertTrue(ok, message)
        paid = storefront.read_order(order["order_id"])
        ok, message = storefront.confirm_result_payment(paid, story_session["id"])
        self.assertFalse(ok)
        self.assertIn("refunded", message)
        saved = storefront.read_order(order["order_id"])
        self.assertEqual(saved["result_offer_id"], "voice")
        self.assertEqual(saved["result_paid_total_cents"], 3900)
        self.assertEqual(saved["result_payments"][-1]["status"], "refunded")


if __name__ == "__main__":
    unittest.main()
