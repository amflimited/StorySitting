"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { safeString } from "@/lib/utils";

const spokenConsentSchema = z.object({
  consent_event_id: z.string().uuid(),
  verification_status: z.enum(["verified", "rejected"]),
  operator_notes: z.string().trim().min(20).max(1_000),
  evidence_reviewed: z.literal("yes")
});

const chapterReleaseSchema = z.object({
  story_chapter_id: z.string().uuid(),
  review_call_request_id: z.string().uuid(),
  decision: z.enum(["family", "private", "withheld"]),
  operator_notes: z.string().trim().min(20).max(1_000),
  storyteller_decision_confirmed: z.literal("yes"),
  current_access_revocation_confirmed: z.literal("yes").optional()
});

function deskRedirect(result: string, target?: { kind: "event" | "chapter"; id: string }): never {
  const query = new URLSearchParams({ result });
  if (target) query.set(target.kind, target.id);
  const anchor = target ? `#${target.kind}-${target.id}` : "";
  redirect(`/staff/consent-releases?${query.toString()}${anchor}`);
}

export async function verifySpokenConsentCandidate(formData: FormData) {
  const { supabase } = await requireStaff();
  const parsed = spokenConsentSchema.safeParse({
    consent_event_id: safeString(formData.get("consent_event_id")),
    verification_status: safeString(formData.get("verification_status")),
    operator_notes: safeString(formData.get("operator_notes")),
    evidence_reviewed: safeString(formData.get("evidence_reviewed"))
  });

  if (!parsed.success) deskRedirect("consent_invalid");
  const input = parsed.data;

  const { data: candidate, error: candidateError } = await supabase
    .from("consent_events")
    .select("id,story_room_id,call_request_id,capture_method,verification_status")
    .eq("id", input.consent_event_id)
    .maybeSingle();

  if (
    candidateError ||
    !candidate ||
    candidate.capture_method !== "spoken_on_call" ||
    candidate.verification_status !== "pending" ||
    !candidate.call_request_id
  ) {
    deskRedirect("consent_stale", { kind: "event", id: input.consent_event_id });
  }

  const { data: call, error: callError } = await supabase
    .from("call_requests")
    .select("id,story_room_id,call_kind,status,ended_at,retell_call_id")
    .eq("id", candidate.call_request_id)
    .maybeSingle();

  if (
    callError ||
    !call ||
    call.story_room_id !== candidate.story_room_id ||
    !["interview", "clarification", "follow_up"].includes(call.call_kind) ||
    call.status !== "completed" ||
    !call.ended_at ||
    !call.retell_call_id
  ) {
    deskRedirect("consent_call_required", { kind: "event", id: input.consent_event_id });
  }

  const { error } = await supabase.rpc("verify_spoken_consent_candidate", {
    p_consent_event_id: input.consent_event_id,
    p_verification_status: input.verification_status,
    p_operator_notes: input.operator_notes
  });

  if (error) {
    console.error("Spoken consent verification failed", {
      consentEventId: input.consent_event_id,
      code: error.code
    });
    deskRedirect("consent_failed", { kind: "event", id: input.consent_event_id });
  }

  revalidatePath("/staff/consent-releases");
  revalidatePath("/staff");
  deskRedirect(
    input.verification_status === "verified" ? "consent_verified" : "consent_rejected",
    { kind: "event", id: input.consent_event_id }
  );
}

export async function recordStorytellerChapterRelease(formData: FormData) {
  const { supabase } = await requireStaff();
  const parsed = chapterReleaseSchema.safeParse({
    story_chapter_id: safeString(formData.get("story_chapter_id")),
    review_call_request_id: safeString(formData.get("review_call_request_id")),
    decision: safeString(formData.get("decision")),
    operator_notes: safeString(formData.get("operator_notes")),
    storyteller_decision_confirmed: safeString(formData.get("storyteller_decision_confirmed")),
    current_access_revocation_confirmed: safeString(formData.get("current_access_revocation_confirmed")) || undefined
  });

  if (!parsed.success) deskRedirect("release_invalid");
  const input = parsed.data;

  const [{ data: chapter, error: chapterError }, { data: reviewCall, error: callError }] = await Promise.all([
    supabase
      .from("story_chapters")
      .select("id,story_room_id,status,storyteller_share_decision")
      .eq("id", input.story_chapter_id)
      .maybeSingle(),
    supabase
      .from("call_requests")
      .select("id,story_room_id,call_kind,status,ended_at,retell_call_id")
      .eq("id", input.review_call_request_id)
      .maybeSingle()
  ]);

  const isPendingRelease = chapter?.status === "storyteller_review" && chapter.storyteller_share_decision === "pending";
  const isCurrentRelease = ["sponsor_preview", "approved", "delivered"].includes(chapter?.status ?? "") &&
    chapter?.storyteller_share_decision === "family";

  if (chapterError || !chapter || (!isPendingRelease && !isCurrentRelease)) {
    deskRedirect("release_stale", { kind: "chapter", id: input.story_chapter_id });
  }

  if (
    isCurrentRelease &&
    (input.decision === "family" || input.current_access_revocation_confirmed !== "yes")
  ) {
    deskRedirect("release_revocation_invalid", { kind: "chapter", id: input.story_chapter_id });
  }

  if (
    callError ||
    !reviewCall ||
    reviewCall.story_room_id !== chapter.story_room_id ||
    reviewCall.call_kind !== "story_review" ||
    reviewCall.status !== "completed" ||
    !reviewCall.ended_at ||
    !reviewCall.retell_call_id
  ) {
    deskRedirect("release_call_required", { kind: "chapter", id: input.story_chapter_id });
  }

  if (isCurrentRelease) {
    const { data: currentReleaseEvent, error: releaseEventError } = await supabase
      .from("consent_events")
      .select("id,decision,occurred_at")
      .eq("story_chapter_id", input.story_chapter_id)
      .eq("consent_scope", "family_sharing")
      .eq("verification_status", "verified")
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (
      releaseEventError ||
      !currentReleaseEvent ||
      currentReleaseEvent.decision !== "granted" ||
      new Date(reviewCall.ended_at).getTime() <= new Date(currentReleaseEvent.occurred_at).getTime()
    ) {
      deskRedirect("release_new_call_required", { kind: "chapter", id: input.story_chapter_id });
    }
  }

  const { error } = await supabase.rpc("record_storyteller_chapter_release", {
    p_story_chapter_id: input.story_chapter_id,
    p_review_call_request_id: input.review_call_request_id,
    p_decision: input.decision,
    p_operator_notes: input.operator_notes
  });

  if (error) {
    console.error("Storyteller chapter release failed", {
      storyChapterId: input.story_chapter_id,
      code: error.code
    });
    deskRedirect("release_failed", { kind: "chapter", id: input.story_chapter_id });
  }

  revalidatePath("/staff/consent-releases");
  revalidatePath("/staff");
  revalidatePath(`/story-rooms/${chapter.story_room_id}`);
  deskRedirect(isCurrentRelease ? "release_access_removed" : "release_recorded", {
    kind: "chapter",
    id: input.story_chapter_id
  });
}
