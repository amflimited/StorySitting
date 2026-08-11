import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { RetellWebhookPayload } from "@/lib/retell-webhook";
import { verifyRetellWebhook } from "@/lib/retell-webhook";

export const runtime = "nodejs";

const MAX_WEBHOOK_BYTES = 2 * 1024 * 1024;

function parsePayload(rawBody: string): RetellWebhookPayload | null {
  let value: unknown;
  try {
    value = JSON.parse(rawBody);
  } catch {
    return null;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.event !== "string" || !candidate.event || candidate.event.length > 100) return null;
  if (!candidate.call || typeof candidate.call !== "object" || Array.isArray(candidate.call)) return null;
  const call = candidate.call as Record<string, unknown>;
  if (typeof call.call_id !== "string" || !call.call_id || call.call_id.length > 300) return null;
  return value as RetellWebhookPayload;
}

export async function POST(request: Request) {
  const apiKey = process.env.RETELL_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Webhook is not configured." }, { status: 503 });
  }

  const rawBody = await request.text();
  if (!verifyRetellWebhook(rawBody, apiKey, request.headers.get("x-retell-signature"))) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }
  if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BYTES) {
    return NextResponse.json({ error: "Payload is too large." }, { status: 413 });
  }

  const payload = parsePayload(rawBody);
  if (!payload) {
    return NextResponse.json({ error: "Invalid call event." }, { status: 400 });
  }

  const eventId = `${payload.event}:${payload.call.call_id}`;
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("import_events").upsert(
    {
      source: "retell",
      event_type: payload.event,
      external_event_id: eventId,
      status: "received",
      payload
    },
    {
      onConflict: "source,external_event_id",
      ignoreDuplicates: true
    }
  );

  // Retell retries are acknowledgements, not state transitions. Ignoring the
  // unique conflict keeps received/failed work retryable and can never move a
  // processed (or currently-processing) event backward.
  if (error) {
    return NextResponse.json({ error: "Event could not be recorded." }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
