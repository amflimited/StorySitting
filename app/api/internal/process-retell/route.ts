import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { processRetellEvent } from "@/lib/retell-event-processor";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { RetellWebhookPayload } from "@/lib/retell-webhook";

export const runtime = "nodejs";
export const maxDuration = 55;

const BATCH_SIZE = 5;
const PROCESSING_LEASE_MS = 2 * 60 * 1000;

function hasCronAuthorization(request: Request, secret: string) {
  const supplied = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  return suppliedBuffer.length === expectedBuffer.length && timingSafeEqual(suppliedBuffer, expectedBuffer);
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Worker is not configured." }, { status: 503 });
  }
  if (!hasCronAuthorization(request, secret)) {
    return new NextResponse(null, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  const staleBefore = new Date(Date.now() - PROCESSING_LEASE_MS).toISOString();
  const { data: queuedEvents, error: queueError } = await supabase
    .from("import_events")
    .select("event_type,external_event_id,payload")
    .eq("source", "retell")
    .or(
      `status.in.(received,failed,needs_matching),and(status.eq.processing,processing_started_at.lt.${staleBefore})`
    )
    .order("received_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (queueError) {
    return NextResponse.json({ error: "Queue is unavailable." }, { status: 500 });
  }

  for (const event of queuedEvents ?? []) {
    if (!event.external_event_id) continue;
    const payload = event.payload as RetellWebhookPayload;
    const { data: claim, error: claimError } = await supabase.rpc("claim_import_event", {
      p_source: "retell",
      p_event_type: event.event_type,
      p_external_event_id: event.external_event_id,
      p_payload: payload
    });
    if (claimError || claim !== "claimed") continue;

    try {
      const outcome = await processRetellEvent(supabase, payload);
      if (outcome.status === "needs_matching") {
        const { error: unmatchedError } = await supabase
          .from("import_events")
          .update({
            status: "needs_matching",
            processing_started_at: null,
            processed_at: null,
            last_error: outcome.reason.slice(0, 1000)
          })
          .eq("source", "retell")
          .eq("external_event_id", event.external_event_id)
          .eq("status", "processing");
        if (unmatchedError) throw new Error(`Unmatched event update failed: ${unmatchedError.message}`);
        continue;
      }

      const { error: processedError } = await supabase
        .from("import_events")
        .update({
          status: "processed",
          processing_started_at: null,
          last_error: null,
          processed_at: new Date().toISOString()
        })
        .eq("source", "retell")
        .eq("external_event_id", event.external_event_id)
        .eq("status", "processing");
      if (processedError) throw new Error(`Event completion failed: ${processedError.message}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Retell processing error";
      await supabase
        .from("import_events")
        .update({
          status: "failed",
          processing_started_at: null,
          processed_at: null,
          last_error: message.slice(0, 1000)
        })
        .eq("source", "retell")
        .eq("external_event_id", event.external_event_id)
        .eq("status", "processing");
    }
  }

  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" }
  });
}
