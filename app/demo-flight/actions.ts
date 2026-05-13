"use server";

import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { buildCapsuleDraft } from "@/lib/capsule-builder";

const DEMO_CONTRIBUTIONS = [
  {
    title: "The smell before everyone arrived",
    contribution_type: "memory",
    body:
      "Every Sunday, Grandma started cooking before church was even over. By the time everyone walked in, the whole house smelled like chicken, noodles, pepper, and coffee. She never measured anything, but she always knew when it was right. The kitchen was crowded, people were talking over each other, and she would keep saying, ‘There’s plenty, sit down.’ I think what I remember most is not just the food, but the way nobody felt like a visitor in her house."
  },
  {
    title: "The recipe was never really written down",
    contribution_type: "recipe",
    body:
      "The recipe card only says chicken, noodles, broth, pepper, and a little flour, but that was never enough to make it taste like hers. She judged everything by feel. She would say the dough should be soft but not sticky, and she could tell from across the room whether the noodles were rolled thin enough. The real recipe was in her hands."
  },
  {
    title: "Everyone had a seat, even when there was not enough room",
    contribution_type: "memory",
    body:
      "There were always more people than chairs. Kids sat on piano benches, someone leaned against the counter, and plates were balanced wherever they could fit. Nobody cared. Sunday dinner meant you belonged there. Grandma always noticed who had not eaten enough and somehow sent everyone home with leftovers."
  }
] as const;

const DEMO_MEMORY_CARDS = [
  {
    title: "The house smelled like Sunday dinner",
    summary:
      "Grandma's Sunday meal created the feeling of home before anyone even reached the table. The smells, noise, and welcome mattered as much as the food.",
    quote: "Nobody felt like a visitor in her house.",
    people: ["Grandma", "children", "grandchildren"],
    places: ["Grandma's kitchen", "family table"],
    estimated_date: "Sunday family dinners",
    life_era: "Family tradition",
    themes: ["food", "belonging", "home", "family tradition"],
    confidence: 0.9,
    status: "selected"
  },
  {
    title: "The recipe lived in her hands",
    summary:
      "The written recipe could not fully capture Grandma's method. The details lived in her judgment, touch, and repeated practice.",
    quote: "The real recipe was in her hands.",
    people: ["Grandma"],
    places: ["kitchen"],
    estimated_date: "undated family recipe",
    life_era: "Recipe and tradition",
    themes: ["recipe", "craft", "memory", "tradition"],
    confidence: 0.88,
    status: "selected"
  },
  {
    title: "There was always room at the table",
    summary:
      "The Sunday dinner tradition made everyone feel included even when the house was crowded and informal.",
    quote: "Sunday dinner meant you belonged there.",
    people: ["kids", "relatives", "Grandma"],
    places: ["family table", "kitchen"],
    estimated_date: "childhood and family gatherings",
    life_era: "Family gatherings",
    themes: ["belonging", "gathering", "ordinary love", "family"],
    confidence: 0.9,
    status: "selected"
  }
] as const;

function demoSlug() {
  return `grandmas-sunday-dinner-${Date.now().toString(36)}`;
}

export async function launchDemoFlight() {
  const { supabase, user } = await requireStaff();

  const { data: customerAccount, error: accountError } = await supabase
    .from("customer_accounts")
    .insert({
      owner_user_id: user.id,
      source: "demo-flight"
    })
    .select("id")
    .single();

  if (accountError) throw new Error(accountError.message);
  if (!customerAccount) throw new Error("Demo customer account could not be created.");

  const { data: room, error: roomError } = await supabase
    .from("story_rooms")
    .insert({
      customer_account_id: customerAccount.id,
      title: "Grandma’s Sunday Dinner",
      subject_name: "Grandma’s Sunday Dinner",
      package_tier: "signature",
      production_status: "capsule_production",
      onboarding_data: {
        demo_flight: "signature-story-capsule-1",
        category_key: "recipe-tradition",
        why_now:
          "The family keeps talking about how nobody makes it exactly like Grandma did, and they want to capture the recipe, the memories, and the feeling of those Sundays before the details fade.",
        what_should_not_be_forgotten:
          "How she cooked without measuring, how the house smelled, where everyone sat, how the meal brought people together, and the little things she always said while cooking.",
        known_materials:
          "Old recipe card, family photos from Sunday dinners, memories from children and grandchildren, possible voice note from one relative.",
        unanswered_questions:
          "Where did the recipe come from? Who taught her? What changed over the years? What did Sunday dinner mean to the family?"
      }
    })
    .select("id,title,subject_name")
    .single();

  if (roomError) throw new Error(roomError.message);
  if (!room) throw new Error("Demo Story Room could not be created.");

  await supabase.from("story_room_members").insert({
    story_room_id: room.id,
    user_id: user.id,
    display_name: user.email ?? "Demo staff owner",
    email: user.email,
    role: "owner",
    status: "active"
  });

  const contributionPayload = DEMO_CONTRIBUTIONS.map((contribution, index) => ({
    story_room_id: room.id,
    source: "admin",
    source_external_id: `demo-flight-1-${room.id}-${index}`,
    contribution_type: contribution.contribution_type,
    title: contribution.title,
    body: contribution.body,
    review_status: "used_in_memory_card",
    raw_payload: { demo_flight: true }
  }));

  const { data: insertedContributions, error: contributionError } = await supabase
    .from("contributions")
    .insert(contributionPayload)
    .select("id,title");

  if (contributionError) throw new Error(contributionError.message);

  const memoryCardPayload = DEMO_MEMORY_CARDS.map((card, index) => ({
    story_room_id: room.id,
    contribution_id: insertedContributions?.[index]?.id ?? null,
    title: card.title,
    summary: card.summary,
    quote: card.quote,
    people: card.people,
    places: card.places,
    estimated_date: card.estimated_date,
    life_era: card.life_era,
    themes: card.themes,
    confidence: card.confidence,
    status: card.status
  }));

  const { error: memoryCardError } = await supabase.from("memory_cards").insert(memoryCardPayload);
  if (memoryCardError) throw new Error(memoryCardError.message);

  const outline = {
    story_focus: "Grandma’s Sunday Dinner",
    themes: "recipe, family tradition, belonging, ordinary love, food memory",
    people: "Grandma, children, grandchildren, relatives",
    places: "Grandma's kitchen, family table, family home",
    life_eras: "Family tradition, Sunday gatherings",
    memory_card_count: DEMO_MEMORY_CARDS.length,
    strongest_quotes: DEMO_MEMORY_CARDS.map((card) => card.quote),
    section_candidates: DEMO_MEMORY_CARDS.map((card) => ({
      title: card.title,
      life_era: card.life_era,
      summary: card.summary,
      themes: card.themes
    })),
    open_questions:
      "Ask where the recipe came from, who taught Grandma, what she changed, and what Sunday dinner meant to each branch of the family.",
    interview_plan:
      "Open with the smell and sound of the kitchen, move into the recipe details, ask who gathered and where they sat, use the recipe card as an object prompt, and close with what the family wants future generations to feel.",
    recommended_output:
      "Recipe & Tradition Capsule with edited story sections, selected pull quotes, recipe notes, caption placeholders, voice excerpt placeholders, and printable keepsake draft."
  };

  const { data: storyMap, error: storyMapError } = await supabase
    .from("story_maps")
    .insert({
      story_room_id: room.id,
      status: "draft",
      outline,
      created_by_user_id: user.id
    })
    .select("outline,status,created_at")
    .single();

  if (storyMapError) throw new Error(storyMapError.message);

  const draft = buildCapsuleDraft({
    roomTitle: room.title,
    subjectName: room.subject_name,
    categoryKey: "recipe-tradition",
    storyMap,
    memoryCards: DEMO_MEMORY_CARDS
  });

  const webSlug = demoSlug();
  const { error: capsuleError } = await supabase.from("story_capsules").insert({
    story_room_id: room.id,
    status: "draft",
    web_slug: webSlug,
    capsule_data: {
      ...draft,
      demo_flight: true,
      delivery_note:
        "Demo Flight 1: this draft proves the path from Story Room to contribution, Memory Cards, Story Map, Capsule Builder, and family preview."
    }
  });

  if (capsuleError) throw new Error(capsuleError.message);

  redirect(`/staff/story-rooms/${room.id}`);
}
