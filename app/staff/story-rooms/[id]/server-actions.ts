"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { safeString } from "@/lib/utils";

export async function updateContributionStatus(formData: FormData) {
  const { supabase } = await requireStaff();

  const storyRoomId = safeString(formData.get("story_room_id"));
  const contributionId = safeString(formData.get("contribution_id"));
  const status = safeString(formData.get("status"));

  const { error } = await supabase
    .from("contributions")
    .update({ review_status: status })
    .eq("id", contributionId);

  if (error) throw new Error(error.message);
  revalidatePath(`/staff/story-rooms/${storyRoomId}`);
}

export async function createMemoryCard(formData: FormData) {
  const { supabase } = await requireStaff();

  const storyRoomId = safeString(formData.get("story_room_id"));
  const contributionId = safeString(formData.get("contribution_id"));
  const title = safeString(formData.get("title"));
  const summary = safeString(formData.get("summary"));
  const quote = safeString(formData.get("quote"));
  const themes = safeString(formData.get("themes"))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const { error } = await supabase.from("memory_cards").insert({
    story_room_id: storyRoomId,
    contribution_id: contributionId,
    title,
    summary,
    quote,
    themes,
    status: "draft"
  });

  if (error) throw new Error(error.message);

  await supabase
    .from("contributions")
    .update({ review_status: "used_in_memory_card" })
    .eq("id", contributionId);

  revalidatePath(`/staff/story-rooms/${storyRoomId}`);
}

export async function createStoryMap(formData: FormData) {
  const { supabase, user } = await requireStaff();

  const storyRoomId = safeString(formData.get("story_room_id"));
  const outline = {
    story_focus: safeString(formData.get("story_focus")),
    themes: safeString(formData.get("themes")),
    open_questions: safeString(formData.get("open_questions"))
  };

  const { error } = await supabase.from("story_maps").insert({
    story_room_id: storyRoomId,
    status: "draft",
    outline,
    created_by_user_id: user.id
  });

  if (error) throw new Error(error.message);

  await supabase
    .from("story_rooms")
    .update({ production_status: "story_map_in_progress" })
    .eq("id", storyRoomId);

  revalidatePath(`/staff/story-rooms/${storyRoomId}`);
}
