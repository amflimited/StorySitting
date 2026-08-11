import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  callRequestStatusForRetell,
  monotonicCallStatus,
  verifyRetellWebhook
} from "../lib/retell-webhook";

describe("Retell webhook handling", () => {
  it("verifies the documented HMAC format and rejects stale requests", () => {
    const body = JSON.stringify({ event: "call_ended", call: { call_id: "call_123" } });
    const key = "test-key";
    const timestamp = 1_800_000_000_000;
    const digest = createHmac("sha256", key).update(`${body}${timestamp}`).digest("hex");
    const signature = `v=${timestamp},d=${digest}`;

    expect(verifyRetellWebhook(body, key, signature, timestamp + 1_000)).toBe(true);
    expect(verifyRetellWebhook(body, key, signature, timestamp + 301_000)).toBe(false);
    expect(verifyRetellWebhook(`${body} `, key, signature, timestamp + 1_000)).toBe(false);
  });

  it("maps common terminal outcomes", () => {
    expect(callRequestStatusForRetell({
      event: "call_ended",
      call: { call_id: "one", disconnection_reason: "dial_no_answer" }
    })).toBe("no_answer");
    expect(callRequestStatusForRetell({
      event: "call_analyzed",
      call: { call_id: "two", disconnection_reason: "user_hangup" }
    })).toBe("completed");
    expect(callRequestStatusForRetell({
      event: "call_ended",
      call: { call_id: "three", disconnection_reason: "user_declined" }
    })).toBe("declined");
    expect(callRequestStatusForRetell({
      event: "call_ended",
      call: { call_id: "four", disconnection_reason: "invalid_destination" }
    })).toBe("failed");
    expect(callRequestStatusForRetell({
      event: "call_ended",
      call: { call_id: "five", disconnection_reason: "a_future_reason" }
    })).toBe("needs_human_review");
  });

  it("does not let a delayed provider event move a terminal call backward", () => {
    expect(monotonicCallStatus("completed", "connected")).toBe("completed");
    expect(monotonicCallStatus("no_answer", "completed")).toBe("no_answer");
    expect(monotonicCallStatus("scheduled", "connected")).toBe("connected");
  });
});
