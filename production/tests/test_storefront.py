import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


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
        storefront.PRICES_CONF = base / "stripe-prices.conf"
        storefront.PRICES_CONF.write_text("PRICE_START=price_start\nPRICE_CALL=price_result\n", encoding="utf-8")
        storefront._ensure_dirs()
        self.calls = []

        def fake_stripe(method, path, params=None, *, idempotency_key=None):
            self.calls.append((method, path, params, idempotency_key))
            if path == "/customers":
                return True, {"id": "cus_test"}
            if method == "POST" and path == "/checkout/sessions":
                kind = (params or {}).get("metadata", {}).get("kind")
                suffix = "start" if kind == "story_start" else "result"
                return True, {"id": f"cs_{suffix}", "url": f"https://checkout.stripe.test/{suffix}"}
            if method == "GET" and path.startswith("/checkout/sessions/cs_start"):
                return True, {"id": "cs_start", "payment_status": "paid", "metadata": {"order_id": self.order_id, "kind": "story_start"}, "payment_intent": {"id": "pi_start"}}
            if method == "GET" and path == "/checkout/sessions/cs_result":
                return True, {"id": "cs_result", "status": "open", "payment_status": "unpaid"}
            raise AssertionError(f"unexpected Stripe call: {method} {path}")

        self.real_stripe_call = storefront.stripe_call
        storefront.stripe_call = fake_stripe
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
        storefront.write_order(paid)
        status, location = storefront.start_result_checkout(paid)
        self.assertEqual(status, 303)
        self.assertEqual(location, "https://checkout.stripe.test/result")


if __name__ == "__main__":
    unittest.main()
