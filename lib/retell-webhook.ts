import { createHmac, timingSafeEqual } from "node:crypto";

const FIVE_MINUTES_MS = 5 * 60 * 1000;

export function verifyRetellWebhook(
  rawBody: string,
  apiKey: string,
  signature: string | null,
  now = Date.now()
) {
  if (!signature || !apiKey) return false;

  const match = /^v=(\d+),d=([a-fA-F0-9]+)$/.exec(signature.trim());
  if (!match) return false;

  const timestamp = Number(match[1]);
  if (!Number.isFinite(timestamp) || Math.abs(now - timestamp) > FIVE_MINUTES_MS) {
    return false;
  }

  const supplied = Buffer.from(match[2], "hex");
  const expected = createHmac("sha256", apiKey)
    .update(`${rawBody}${match[1]}`)
    .digest();

  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export type RetellCallPayload = {
  call_id: string;
  call_status?: string;
  metadata?: Record<string, unknown>;
  direction?: "inbound" | "outbound";
  from_number?: string;
  to_number?: string;
  start_timestamp?: number;
  end_timestamp?: number;
  disconnection_reason?: string;
  transcript?: string;
  recording_url?: string;
  call_analysis?: Record<string, unknown>;
  [key: string]: unknown;
};

export type RetellWebhookPayload = {
  event: "call_started" | "call_ended" | "call_analyzed" | string;
  call: RetellCallPayload;
};

export function callRequestStatusForRetell(payload: RetellWebhookPayload) {
  if (payload.event === "call_started") return "connected";

  if (payload.event === "call_ended" || payload.event === "call_analyzed") {
    const reason = payload.call.disconnection_reason ?? "";
    if (payload.event === "call_analyzed" && !reason) return null;
    if (["dial_no_answer", "dial_busy", "dial_failed", "voicemail_reached", "ivr_reached"].includes(reason)) {
      return "no_answer";
    }
    if (["user_declined", "scam_detected", "marked_as_spam"].includes(reason)) return "declined";
    if (
      [
        "concurrency_limit_reached", "no_valid_payment", "invalid_destination",
        "telephony_provider_permission_denied", "telephony_provider_unavailable",
        "sip_routing_error", "registered_call_timeout", "error_llm_websocket_open",
        "error_llm_websocket_lost_connection", "error_llm_websocket_runtime",
        "error_llm_websocket_corrupt_payload", "error_no_audio_received", "error_asr",
        "error_retell", "error_unknown", "error_user_not_joined"
      ].includes(reason) || payload.call.call_status === "error"
    ) return "failed";
    if (
      [
        "user_hangup", "agent_hangup", "call_transfer", "inactivity",
        "max_duration_reached", "transfer_bridged", "manual_stopped"
      ].includes(reason)
    ) return "completed";
    return "needs_human_review";
  }

  return null;
}

const TERMINAL_CALL_STATUSES = new Set([
  "completed",
  "no_answer",
  "declined",
  "failed",
  "cancelled",
  "needs_human_review"
]);

export function monotonicCallStatus(current: string, incoming: string | null) {
  if (!incoming) return current;
  if (TERMINAL_CALL_STATUSES.has(current)) return current;
  return incoming;
}
