"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { safeString } from "@/lib/utils";
import { buildMemoryCardDraft } from "@/lib/memory-card-drafts";
import { buildCapsuleDraft } from "@/lib/capsule-builder";

function csvList(value: FormDataEntryValue | null) {
  return safeString(value)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

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
  revalidatePath("/staff");
}

export async function createMemoryCard(formData: FormData) {
  const { supabase } = await requireStaff();

  const storyRoomId = safeString(formData.get("story_room_id"));
  const contributionId = safeString(formData.get("contribution_id"));
  const title = safeString(formData.get("title"));
  const summary = safeString(formData.get("summary"));
  const quote = safeString(formData.get("quote"));
  const themes = csvList(formData.get("themes"));
  const people = csvList(formData.get("people"));
  const places = csvList(formData.get("places"));
  const estimatedDate = safeString(formData.get("estimated_date"));
  const lifeEra = safeString(formData.get("life_era"));

  const { error } = await supabase.from("memory_cards").insert({
    story_room_id: storyRoomId,
    contribution_id: contributionId,
    title,
    summary,
    quote,
    people,
    places,
    estimated_date: estimatedDate,
    life_era: lifeEra,
    themes,
    confidence: 0.8,
    status: "draft"
  });

  if (error) throw new Error(error.message);

  await supabase
    .from("contributions")
    .update({ review_status: "used_in_memory_card" })
    .eq("id", contributionId);

  revalidatePath(`/staff/story-rooms/${storyRoomId}`);
  revalidatePath("/staff");
}

export async function createDraftMemoryCard(formData: FormData) {
  const { supabase } = await requireStaff();

  const storyRoomId = safeString(formData.get("story_room_id"));
  const contributionId = safeString(formData.get("contribution_id"));

  const { data: contribution, error: fetchError } = await supabase
    .from("contributions")
    .select("id,title,body,contribution_type,source")
    .eq("id", contributionId)
    .single();

  if (fetchError) throw new Error(fetchError.message);
  if (!contribution) throw new Error("Contribution not found");

  const draft = buildMemoryCardDraft(contribution);

  const { error } = await supabase.from("memory_cards").insert({
    story_room_id: storyRoomId,
    contribution_id: contributionId,
    title: draft.title,
    summary: draft.summary,
    quote: draft.quote,
    people: draft.people,
    places: draft.places,
    estimated_date: draft.estimated_date,
    life_era: draft.life_era,
    themes: draft.themes,
    confidence: draft.confidence,
    status: "draft"
  });

  if (error) throw new Error(error.message);

  await supabase
    .from("contributions")
    .update({ review_status: "used_in_memory_card" })
    .eq("id", contributionId);

  revalidatePath(`/staff/story-rooms/${storyRoomId}`);
  revalidatePath("/staff");
}

export async function updateMemoryCardStatus(formData: FormData) {
  const { supabase } = await requireStaff();

  const storyRoomId = safeString(formData.get("story_room_id"));
  const memoryCardId = safeString(formData.get("memory_card_id"));
  const status = safeString(formData.get("status"));

  const { error } = await supabase
    .from("memory_cards")
    .update({ status })
    .eq("id", memoryCardId);

  if (error) throw new Error(error.message);
  revalidatePath(`/staff/story-rooms/${storyRoomId}`);
  revalidatePath("/staff");
}

export async function createStoryMap(formData: FormData) {
  const { supabase, user } = await requireStaff();

  const storyRoomId = safeString(formData.get("story_room_id"));
  const outline = {
    story_focus: safeString(formData.get("story_focus")),
    themes: safeString(formData.get("themes")),
    open_questions: safeString(formData.get("open_questions")),
    interview_plan: safeString(formData.get("interview_plan")),
    recommended_output: safeString(formData.get("recommended_output"))
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
  revalidatePath("/staff");
}

export async function createStoryMapFromMemoryCards(formData: FormData) {
  const { supabase, user } = await requireStaff();
  const storyRoomId = safeString(formData.get("story_room_id"));

  const { data: room } = await supabase
    .from("story_rooms")
    .select("title,subject_name,onboarding_data")
    .eq("id", storyRoomId)
    .single();

  const { data: memoryCards, error: memoryError } = await supabase
    .from("memory_cards")
    .select("title,summary,quote,themes,people,places,estimated_date,life_era,status")
    .eq("story_room_id", storyRoomId)
    .order("created_at", { ascending: true });

  if (memoryError) throw new Error(memoryError.message);

  const approvedCards = (memoryCards ?? []).filter((card: any) => card.status !== "archived");
  const themes = Array.from(new Set(approvedCards.flatMap((card: any) => card.themes ?? []))).slice(0, 12);
  const people = Array.from(new Set(approvedCards.flatMap((card: any) => card.people ?? []))).slice(0, 12);
  const places = Array.from(new Set(approvedCards.flatMap((card: any) => card.places ?? []))).slice(0, 12);
  const eras = Array.from(new Set(approvedCards.map((card: any) => card.life_era).filter(Boolean))).slice(0, 8);

  const outline = {
    story_focus: room?.subject_name || room?.title || "StorySitting project",
    themes: themes.join(", "),
    people: people.join(", "),
    places: places.join(", "),
    life_eras: eras.join(", "),
    memory_card_count: approvedCards.length,
    strongest_quotes: approvedCards.map((card: any) => card.quote).filter(Boolean).slice(0, 8),
    section_candidates: approvedCards.map((card: any) => ({
      title: card.title,
      life_era: card.life_era,
      summary: card.summary,
      themes: card.themes ?? []
    })),
    open_questions: "Review missing dates, names, locations, and emotional turning points before the guided session.",
    interview_plan: "Open with the Story Room focus, move through the strongest Memory Cards, use photos/objects as prompts, verify details, and close with what the family should remember.",
    recommended_output: "Signature Story Capsule with edited sections, pull quotes, captions, selected voice excerpts, and printable PDF."
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
  revalidatePath("/staff");
}

export async function updateStoryRoomStatus(formData: FormData) {
  const { supabase } = await requireStaff();

  const storyRoomId = safeString(formData.get("story_room_id"));
  const productionStatus = safeString(formData.get("production_status"));

  const { error } = await supabase
    .from("story_rooms")
    .update({ production_status: productionStatus })
    .eq("id", storyRoomId);

  if (error) throw new Error(error.message);
  revalidatePath(`/staff/story-rooms/${storyRoomId}`);
  revalidatePath("/staff");
}

export async function createStoryCapsuleFromStoryMap(formData: FormData) {
  const { supabase } = await requireStaff();

  const storyRoomId = safeString(formData.get("story_room_id"));
  const categoryKey = safeString(formData.get("category_key")) || "parent-grandparent";

  const { data: room, error: roomError } = await supabase
    .from("story_rooms")
    .select("id,title,subject_name")
    .eq("id", storyRoomId)
    .single();

  if (roomError) throw new Error(roomError.message);
  if (!room) throw new Error("Story Room not found");

  const { data: storyMaps, error: mapError } = await supabase
    .from("story_maps")
    .select("outline,status,created_at")
    .eq("story_room_id", storyRoomId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (mapError) throw new Error(mapError.message);

  const { data: memoryCards, error: cardsError } = await supabase
    .from("memory_cards")
    .select("title,summary,quote,themes,people,places,estimated_date,life_era,status")
    .eq("story_room_id", storyRoomId)
    .order("created_at", { ascending: true });

  if (cardsError) throw new Error(cardsError.message);

  const draft = buildCapsuleDraft({
    roomTitle: room.title ?? "Story Room",
    subjectName: room.subject_name,
    categoryKey,
    storyMap: storyMaps?.[0] ?? null,
    memoryCards: memoryCards ?? []
  });

  const baseSlug = slugify(draft.title) || `story-capsule-${storyRoomId.slice(0, 8)}`;
  const webSlug = `${baseSlug}-${Date.now().toString(36)}`;

  const { error } = await supabase
    .from("story_capsules")
    .insert({
      story_room_id: storyRoomId,
      status: "draft",
      web_slug: webSlug,
      capsule_data: draft
    });

  if (error) throw new Error(error.message);

  await supabase
    .from("story_rooms")
    .update({ production_status: "capsule_production" })
    .eq("id", storyRoomId);

  revalidatePath(`/staff/story-rooms/${storyRoomId}`);
  revalidatePath(`/story-capsules/${webSlug}`);
  revalidatePath("/story-capsules");
  revalidatePath("/staff");
}

export async function createStoryCapsulePlaceholder(formData: FormData) {
  const { supabase } = await requireStaff();

  const storyRoomId = safeString(formData.get("story_room_id"));
  const webSlug = safeString(formData.get("web_slug"));

  const capsuleData = {
    title: safeString(formData.get("title")),
    category_key: safeString(formData.get("category_key")),
    delivery_note: safeString(formData.get("delivery_note")),
    included_assets: safeString(formData.get("included_assets"))
  };

  const { error } = await supabase
    .from("story_capsules")
    .insert({
      story_room_id: storyRoomId,
      status: "draft",
      web_slug: webSlug || null,
      capsule_data: capsuleData
    });

  if (error) throw new Error(error.message);

  await supabase
    .from("story_rooms")
    .update({ production_status: "capsule_production" })
    .eq("id", storyRoomId);

  revalidatePath(`/staff/story-rooms/${storyRoomId}`);
  revalidatePath("/staff");
}
