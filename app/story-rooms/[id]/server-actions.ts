"use server";

import { revalidatePath } from "next/cache";
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
    raw_invite_data: { display_name: displayName }
  });

  if (error) throw new Error(error.message);
  revalidatePath(`/story-rooms/${storyRoomId}`);
}
