"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { makeInviteToken, safeString } from "@/lib/utils";

export async function createInvite(formData: FormData) {
  const { supabase, user } = await requireUser();
  const storyRoomId = safeString(formData.get("story_room_id"));
  const email = safeString(formData.get("email"));
  const phone = safeString(formData.get("phone"));
  const displayName = safeString(formData.get("display_name"));

  const { error } = await supabase.from("invites").insert({
    story_room_id: storyRoomId,
    invited_by_user_id: user.id,
    invite_token: makeInviteToken(),
    email,
    phone,
    role: "contributor",
    status: "pending",
    raw_invite_data: { display_name: displayName },
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  });

  if (error) throw new Error(error.message);
  revalidatePath(`/story-rooms/${storyRoomId}`);
}

export async function addFamilyQuestion(formData: FormData) {
  const { supabase, user } = await requireUser();
  const storyRoomId = safeString(formData.get("story_room_id"));
  const question = safeString(formData.get("question"));
  const contextNote = safeString(formData.get("context_note"));

  if (!storyRoomId || question.length < 3) {
    throw new Error("Add a question for the next sitting.");
  }

  const { error } = await supabase.from("family_questions").insert({
    story_room_id: storyRoomId,
    submitted_by_user_id: user.id,
    submitted_by_name: user.user_metadata?.full_name ?? user.email,
    question,
    context_note: contextNote || null,
    source: "sponsor",
    status: "queued"
  });

  if (error) throw new Error(error.message);
  revalidatePath(`/story-rooms/${storyRoomId}`);
}

const correctionSchema = z.object({
  story_room_id: z.string().uuid(),
  story_chapter_id: z.string().uuid(),
  correction_type: z.enum(["fact", "name", "date", "privacy", "tone", "other"]),
  request: z.string().trim().min(2).max(2_000)
}).strict();

export async function requestStoryCorrection(formData: FormData) {
  const { supabase, user } = await requireUser();
  const parsed = correctionSchema.safeParse({
    story_room_id: safeString(formData.get("story_room_id")),
    story_chapter_id: safeString(formData.get("story_chapter_id")),
    correction_type: safeString(formData.get("correction_type")),
    request: safeString(formData.get("request"))
  });
  if (!parsed.success) throw new Error("Describe the correction in 2,000 characters or fewer.");

  const input = parsed.data;
  const { data: chapter, error: chapterError } = await supabase
    .from("story_chapters")
    .select("id,story_room_id,status")
    .eq("id", input.story_chapter_id)
    .eq("story_room_id", input.story_room_id)
    .maybeSingle();
  if (chapterError || !chapter || chapter.status !== "delivered") {
    throw new Error("This correction pass is not available.");
  }

  const { error } = await supabase.rpc("submit_story_correction", {
    p_story_room_id: input.story_room_id,
    p_story_chapter_id: input.story_chapter_id,
    p_correction_type: input.correction_type,
    p_request: input.request,
    p_requested_by_name: user.user_metadata?.full_name ?? user.email ?? "Family sponsor"
  });
  if (error) throw new Error(error.message || "The correction could not be saved. Nothing was changed.");
  revalidatePath(`/story-rooms/${input.story_room_id}`);
}
