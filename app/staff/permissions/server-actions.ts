"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { safeString } from "@/lib/utils";

const verificationSchema = z.object({
  permission_request_id: z.string().uuid(),
  human_call_request_id: z.string().uuid(),
  evidence_note: z.string().trim().min(20).max(1_000),
  direct_contact_confirmed: z.literal("yes"),
  ai_interview_confirmed: z.literal("yes"),
  recording_boundary_confirmed: z.literal("yes")
});

const dispositionSchema = z.object({
  permission_request_id: z.string().uuid(),
  human_call_request_id: z.string().uuid(),
  disposition: z.enum(["declined", "wrong_person", "could_not_verify"]),
  operator_notes: z.string().trim().min(20).max(1_000),
  negative_outcome_confirmed: z.literal("yes")
});

function permissionsRedirect(result: string, requestId?: string): never {
  const query = new URLSearchParams({ result });
  if (requestId) query.set("request", requestId);
  redirect(`/staff/permissions?${query.toString()}${requestId ? `#request-${requestId}` : ""}`);
}

export async function verifyStorytellerIdentity(formData: FormData) {
  const { supabase } = await requireStaff();

  const parsed = verificationSchema.safeParse({
    permission_request_id: safeString(formData.get("permission_request_id")),
    human_call_request_id: safeString(formData.get("human_call_request_id")),
    evidence_note: safeString(formData.get("evidence_note")),
    direct_contact_confirmed: safeString(formData.get("direct_contact_confirmed")),
    ai_interview_confirmed: safeString(formData.get("ai_interview_confirmed")),
    recording_boundary_confirmed: safeString(formData.get("recording_boundary_confirmed"))
  });

  if (!parsed.success) permissionsRedirect("invalid");

  const input = parsed.data;
  const { data: request, error: requestError } = await supabase
    .from("storyteller_permission_requests")
    .select("id,status")
    .eq("id", input.permission_request_id)
    .maybeSingle();

  if (requestError || !request || request.status !== "identity_pending") {
    permissionsRedirect("stale", input.permission_request_id);
  }

  const { data: humanCall, error: humanCallError } = await supabase
    .from("call_requests")
    .select("id,permission_request_id,call_kind,status,ended_at,retell_call_id")
    .eq("id", input.human_call_request_id)
    .maybeSingle();

  const eligibleCallKind = humanCall?.call_kind === "human_permission" || humanCall?.call_kind === "inbound_permission";
  const eligibleCallStatus = humanCall?.status === "completed"
    && Boolean(humanCall.ended_at)
    && Boolean(humanCall.retell_call_id);

  if (
    humanCallError ||
    !humanCall ||
    humanCall.permission_request_id !== input.permission_request_id ||
    !eligibleCallKind ||
    !eligibleCallStatus
  ) {
    permissionsRedirect("call_required", input.permission_request_id);
  }

  const evidence = {
    statement_version: "human_identity_2026_08_11",
    operator_notes: input.evidence_note,
    identity_attested: true,
    ai_scope_explained: true,
    recording_boundary_explained: true
  };

  const { error } = await supabase.rpc("verify_storyteller_permission_identity", {
    p_permission_request_id: input.permission_request_id,
    p_human_call_request_id: humanCall.id,
    p_evidence: evidence
  });

  if (error) {
    console.error("Storyteller identity verification failed", {
      permissionRequestId: input.permission_request_id,
      code: error.code
    });
    permissionsRedirect("failed", input.permission_request_id);
  }

  revalidatePath("/staff/permissions");
  revalidatePath("/staff");
  permissionsRedirect("verified", input.permission_request_id);
}

export async function recordPermissionDisposition(formData: FormData) {
  const { supabase } = await requireStaff();

  const parsed = dispositionSchema.safeParse({
    permission_request_id: safeString(formData.get("permission_request_id")),
    human_call_request_id: safeString(formData.get("human_call_request_id")),
    disposition: safeString(formData.get("disposition")),
    operator_notes: safeString(formData.get("operator_notes")),
    negative_outcome_confirmed: safeString(formData.get("negative_outcome_confirmed"))
  });

  if (!parsed.success) permissionsRedirect("disposition_invalid");

  const input = parsed.data;
  const [{ data: request, error: requestError }, { data: humanCall, error: callError }] = await Promise.all([
    supabase
      .from("storyteller_permission_requests")
      .select("id,status")
      .eq("id", input.permission_request_id)
      .maybeSingle(),
    supabase
      .from("call_requests")
      .select("id,permission_request_id,call_kind,status,ended_at,retell_call_id")
      .eq("id", input.human_call_request_id)
      .maybeSingle()
  ]);

  if (requestError || !request || request.status !== "identity_pending") {
    permissionsRedirect("stale", input.permission_request_id);
  }

  const eligibleKind = humanCall?.call_kind === "human_permission" || humanCall?.call_kind === "inbound_permission";
  const requestMatches = humanCall?.permission_request_id === input.permission_request_id;
  const hasManagedProviderReference = Boolean(humanCall?.retell_call_id);
  const completedStatus = humanCall?.status === "completed";
  const completedConversation = humanCall?.status === "completed" && Boolean(humanCall.ended_at);
  const terminalWithoutConversation = ["no_answer", "declined", "failed", "needs_human_review"].includes(humanCall?.status ?? "");
  const statusMatchesDisposition = input.disposition === "could_not_verify"
    ? completedStatus || terminalWithoutConversation
    : completedConversation;

  if (callError || !humanCall || !eligibleKind || !requestMatches || !hasManagedProviderReference || !statusMatchesDisposition) {
    permissionsRedirect("disposition_call_required", input.permission_request_id);
  }

  const { error } = await supabase.rpc("record_storyteller_permission_disposition", {
    p_permission_request_id: input.permission_request_id,
    p_human_call_request_id: humanCall.id,
    p_disposition: input.disposition,
    p_operator_notes: input.operator_notes
  });

  if (error) {
    console.error("Storyteller permission disposition failed", {
      permissionRequestId: input.permission_request_id,
      code: error.code
    });
    permissionsRedirect("disposition_failed", input.permission_request_id);
  }

  revalidatePath("/staff/permissions");
  revalidatePath("/staff");
  permissionsRedirect("disposition_recorded", input.permission_request_id);
}
