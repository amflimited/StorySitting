"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { safeString } from "@/lib/utils";

export async function createStoryRoom(formData: FormData) {
  const { supabase, user } = await requireUser();

  let { data: account } = await supabase
    .from("customer_accounts")
    .select("id")
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (!account) {
    const { data: created, error } = await supabase
      .from("customer_accounts")
      .insert({ owner_user_id: user.id, source: "direct" })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    account = created;
  }

  const title = safeString(formData.get("title"));
  const subjectName = safeString(formData.get("subject_name"));
  const packageTier = safeString(formData.get("package_tier")) || "signature";

  const onboardingData = {
    why_now: safeString(formData.get("why_now")),
    known_materials: safeString(formData.get("known_materials"))
  };

  const { data: room, error } = await supabase
    .from("story_rooms")
    .insert({
      customer_account_id: account.id,
      title,
      subject_name: subjectName,
      package_tier: packageTier,
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
