import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  callRequestStatusForRetell,
  monotonicCallStatus,
  type RetellWebhookPayload
} from "@/lib/retell-webhook";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

export type RetellEventProcessOutcome =
  | { status: "processed" }
  | { status: "needs_matching"; reason: string };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/**
 * Applies a verified Retell event to StorySitting's call and consent records.
 * Queue ownership and import_events state transitions live in the worker so
 * this reducer can be retried after partial failures.
 */
export async function processRetellEvent(
  supabase: SupabaseAdminClient,
  payload: RetellWebhookPayload
): Promise<RetellEventProcessOutcome> {
  const callLookup = await supabase
    .from("call_requests")
    .select("id,story_room_id,sponsor_intake_id,call_kind,direction,from_number,to_number,status,retell_call_id")
    .eq("retell_call_id", payload.call.call_id)
    .maybeSingle();
  let callRequest = callLookup.data;
  if (callLookup.error) throw new Error(`Call lookup failed: ${callLookup.error.message}`);

  const metadataCallRequestId = typeof payload.call.metadata?.call_request_id === "string"
    ? payload.call.metadata.call_request_id
    : null;
  if (!callRequest && metadataCallRequestId) {
    const metadataLookup = await supabase
      .from("call_requests")
      .select("id,story_room_id,sponsor_intake_id,call_kind,direction,from_number,to_number,status,retell_call_id")
      .eq("id", metadataCallRequestId)
      .maybeSingle();
    if (metadataLookup.error) throw new Error(`Metadata call lookup failed: ${metadataLookup.error.message}`);
    if (metadataLookup.data?.retell_call_id && metadataLookup.data.retell_call_id !== payload.call.call_id) {
      throw new Error("Provider metadata points to a call request already bound to another call.");
    }
    if (metadataLookup.data) {
      const { data: bound, error: bindError } = await supabase
        .from("call_requests")
        .update({ retell_call_id: payload.call.call_id, updated_at: new Date().toISOString() })
        .eq("id", metadataLookup.data.id)
        .is("retell_call_id", null)
        .select("id,story_room_id,sponsor_intake_id,call_kind,direction,from_number,to_number,status,retell_call_id")
        .maybeSingle();
      if (bindError) throw new Error(`Call binding failed: ${bindError.message}`);
      if (bound) {
        callRequest = bound;
      } else {
        const { data: rebound, error: reboundError } = await supabase
          .from("call_requests")
          .select("id,story_room_id,sponsor_intake_id,call_kind,direction,from_number,to_number,status,retell_call_id")
          .eq("id", metadataLookup.data.id)
          .single();
        if (reboundError || rebound?.retell_call_id !== payload.call.call_id) {
          throw new Error("Call request was concurrently bound to another provider call.");
        }
        callRequest = rebound;
      }
    }
  }

  if (!callRequest) {
    return {
      status: "needs_matching",
      reason: "Retell call is not linked to a StorySitting call request yet."
    };
  }

  const mappedStatus = callRequestStatusForRetell(payload);
  const status = monotonicCallStatus(callRequest.status, mappedStatus);
  const durationSeconds =
    payload.call.start_timestamp && payload.call.end_timestamp
      ? Math.max(0, Math.round((payload.call.end_timestamp - payload.call.start_timestamp) / 1000))
      : null;

  const { error: callUpdateError } = await supabase
    .from("call_requests")
    .update({
      status,
      ...(payload.call.start_timestamp
        ? { started_at: new Date(payload.call.start_timestamp).toISOString() }
        : {}),
      ...(payload.call.end_timestamp
        ? { ended_at: new Date(payload.call.end_timestamp).toISOString() }
        : {}),
      ...(durationSeconds !== null ? { duration_seconds: durationSeconds } : {}),
      ...(payload.call.disconnection_reason
        ? { disconnection_reason: payload.call.disconnection_reason }
        : {}),
      updated_at: new Date().toISOString()
    })
    .eq("id", callRequest.id);
  if (callUpdateError) throw new Error(`Call update failed: ${callUpdateError.message}`);

  const { error: artifactError } = await supabase.rpc("merge_call_artifact", {
    p_call_request_id: callRequest.id,
    p_transcript: payload.call.transcript ?? null,
    p_recording_url: payload.call.recording_url ?? null,
    p_provider_payload: payload.call
  });
  if (artifactError) throw new Error(`Private call artifact update failed: ${artifactError.message}`);

  if (payload.event === "call_analyzed") {
    const analysis = asRecord(payload.call.call_analysis);
    const custom = asRecord(analysis.custom_analysis_data);
    const scopes = ["contact", "ai_interview", "recording", "transcription", "editing", "family_sharing"];

    for (const scope of scopes) {
      const value = custom[`consent_${scope}`];
      if (value !== "granted" && value !== "declined") continue;

      const { data: existingConsent, error: consentLookupError } = await supabase
        .from("consent_events")
        .select("id")
        .eq("call_request_id", callRequest.id)
        .eq("consent_scope", scope)
        .maybeSingle();
      if (consentLookupError) throw new Error(`Consent evidence lookup failed: ${consentLookupError.message}`);
      let consentId = existingConsent?.id;
      if (!consentId) {
        const { data: createdConsent, error: consentError } = await supabase
          .from("consent_events")
          .insert({
            story_room_id: callRequest.story_room_id,
            sponsor_intake_id: callRequest.sponsor_intake_id,
            call_request_id: callRequest.id,
            storyteller_name: String(custom.storyteller_name || "Storyteller"),
            consent_scope: scope,
            decision: value,
            capture_method: "spoken_on_call",
            verification_status: "pending",
            evidence: { source: "provider_candidate" },
            occurred_at: payload.call.end_timestamp
              ? new Date(payload.call.end_timestamp).toISOString()
              : new Date().toISOString()
          })
          .select("id")
          .single();
        if (consentError || !createdConsent) {
          const { data: raced, error: racedError } = await supabase
            .from("consent_events")
            .select("id")
            .eq("call_request_id", callRequest.id)
            .eq("consent_scope", scope)
            .single();
          if (racedError) throw new Error(`Consent candidate race recovery failed: ${racedError.message}`);
          consentId = raced?.id;
        } else {
          consentId = createdConsent.id;
        }
      }
      if (!consentId) throw new Error("Consent candidate could not be resolved.");
      const { error: evidenceError } = await supabase.from("consent_event_evidence").upsert({
        consent_event_id: consentId,
        evidence: {
          retell_call_id: payload.call.call_id,
          analysis_field: `consent_${scope}`,
          analyzed_decision: value,
          requires_human_verification: true
        }
      });
      if (evidenceError) throw new Error(`Private consent evidence update failed: ${evidenceError.message}`);
    }

    const remoteNumber = (payload.call.direction ?? callRequest.direction) === "inbound"
      ? (payload.call.from_number ?? callRequest.from_number)
      : (payload.call.to_number ?? callRequest.to_number);
    if (custom.do_not_call === true && remoteNumber) {
      const { error: dncError } = await supabase.from("do_not_call_entries").upsert(
        {
          storyteller_phone: remoteNumber,
          reason: "Requested during StorySitting call",
          source: "storyteller_request",
          requested_at: new Date().toISOString()
        },
        { onConflict: "storyteller_phone" }
      );
      if (dncError) throw new Error(`Do-not-call update failed: ${dncError.message}`);
    }
  }

  if (
    callRequest.call_kind === "interview" &&
    mappedStatus &&
    ["call_ended", "call_analyzed"].includes(payload.event)
  ) {
    const workflowStatus = status === "completed" ? "interview_complete" : "interview_needs_review";
    const [{ error: intakeStageError }, { error: roomStageError }] = await Promise.all([
      supabase
        .from("sponsor_intakes")
        .update({ status: workflowStatus, updated_at: new Date().toISOString() })
        .eq("id", callRequest.sponsor_intake_id),
      supabase
        .from("story_rooms")
        .update({ production_status: workflowStatus })
        .eq("id", callRequest.story_room_id)
    ]);
    if (intakeStageError || roomStageError) {
      throw new Error(`Workflow status update failed: ${intakeStageError?.message ?? roomStageError?.message}`);
    }
  }

  return { status: "processed" };
}
