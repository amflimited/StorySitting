"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { safeString } from "@/lib/utils";

export async function createHomeplaceStoryRoom(formData: FormData) {
  const { supabase, user } = await requireUser();

  let { data: account } = await supabase
    .from("customer_accounts")
    .select("id")
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (!account) {
    const { data: created, error } = await supabase
      .from("customer_accounts")
      .insert({ owner_user_id: user.id, source: "homeplace" })
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    account = created;
  }

  const onboardingData = {
    story_type: "homeplace_transition",
    place_type: safeString(formData.get("place_type")),
    why_now: safeString(formData.get("why_now")),
    not_forgotten: safeString(formData.get("not_forgotten")),
    known_materials: safeString(formData.get("known_materials")),
    contributors_to_invite: safeString(formData.get("contributors_to_invite")),
    family_questions: safeString(formData.get("family_questions"))
  };

  const { data: room, error } = await supabase
    .from("story_rooms")
    .insert({
      customer_account_id: account.id,
      title: safeString(formData.get("title")),
      subject_name: safeString(formData.get("subject_name")),
      package_tier: "signature",
      production_status: "onboarding",
      privacy_status: "private",
      onboarding_data: onboardingData
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  await supabase.from("story_room_members").insert({
    story_room_id: room.id,
    user_id: user.id,
    display_name: user.user_metadata?.full_name ?? user.email,
    email: user.email,
    role: "owner",
    status: "active"
  });

  redirect(`/story-rooms/${room.id}`);
}
