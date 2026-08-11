import importlib.util
import tempfile
import time
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).parents[1] / "ss-reconcile.py"
SPEC = importlib.util.spec_from_file_location("storysitting_reconcile", MODULE_PATH)
reconcile = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(reconcile)


class ReconcileTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        reconcile.ORDERS_DIR = Path(self.temp.name) / "orders"
        reconcile.ORDERS_DIR.mkdir()
        reconcile.DRY = False
        self.mail = []
        self.real_mail = reconcile.mail
        self.real_stripe_get = reconcile.stripe_get
        reconcile.mail = lambda sender, recipient, subject, body, category: self.mail.append((recipient, subject, category)) or True
        self.order = {
            "order_id": "ss_0123456789abcdef01",
            "created_at": int(time.time()),
            "status": "awaiting_payment",
            "start_payment_status": "unpaid",
            "start_checkout_session": "cs_start",
            "sponsor_token": "sponsor_token_for_test_1234567890",
            "permission_token": "permission_token_test_123456789",
            "permission_status": "waiting_for_storyteller",
            "intake": {"buyer_name": "Maya", "buyer_email": "maya@example.com", "subject_name": "Ray", "relationship": "Granddaughter", "best_times": "Morning", "capture": "The farm"},
        }

    def tearDown(self):
        reconcile.mail = self.real_mail
        reconcile.stripe_get = self.real_stripe_get
        self.temp.cleanup()

    def test_paid_start_reconciles_and_sends_canonical_handoff_once(self):
        def fake_get(path):
            if path.startswith("/checkout/sessions/cs_start"):
                return True, {"payment_status": "paid", "metadata": {"order_id": self.order["order_id"], "kind": "story_start"}, "payment_intent": {"id": "pi_start"}}
            if path.startswith("/payment_intents/pi_start"):
                return True, {"status": "succeeded", "latest_charge": {"refunded": False, "disputed": False}}
            raise AssertionError(path)
        reconcile.stripe_get = fake_get
        result = reconcile.reconcile(self.order)
        self.assertIn("permission_pending", result)
        self.assertEqual(self.order["start_payment_status"], "paid")
        self.assertEqual(self.order["status"], "permission_pending")
        self.assertEqual(len(self.mail), 2)
        self.assertNotIn("payment_method", self.order)
        reconcile.reconcile(self.order)
        self.assertEqual(len(self.mail), 2)

    def test_permission_response_notifications_are_not_duplicated(self):
        self.order.update({"status": "identity_pending", "start_payment_status": "paid", "permission_status": "identity_pending", "permission_responded_at": int(time.time())})
        reconcile.reconcile_revocation = lambda order, field, result=False: (False, None)
        reconcile.reconcile(self.order)
        self.assertEqual(len(self.mail), 4)  # paid owner/buyer + response owner/buyer
        reconcile.reconcile(self.order)
        self.assertEqual(len(self.mail), 4)


if __name__ == "__main__":
    unittest.main()
