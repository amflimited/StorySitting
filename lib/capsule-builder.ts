import { getStoryCapsuleCategory } from "@/lib/story-capsule-categories";

type MemoryCardLike = {
  title?: string | null;
  summary?: string | null;
  quote?: string | null;
  themes?: string[] | null;
  people?: string[] | null;
  places?: string[] | null;
  estimated_date?: string | null;
  life_era?: string | null;
  status?: string | null;
};

type StoryMapLike = {
  outline?: Record<string, any> | null;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function listFromOutline(value: unknown) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string") return value.split(",").map((part) => part.trim()).filter(Boolean);
  return [];
}

export function buildCapsuleDraft({
  roomTitle,
  subjectName,
  categoryKey,
  storyMap,
  memoryCards
}: {
  roomTitle: string;
  subjectName?: string | null;
  categoryKey?: string | null;
  storyMap?: StoryMapLike | null;
  memoryCards: MemoryCardLike[];
}) {
  const category = getStoryCapsuleCategory(categoryKey);
  const selected = memoryCards.filter((card) => card.status !== "archived");
  const selectedPreferred = selected.filter((card) => card.status === "selected");
  const cards = selectedPreferred.length ? selectedPreferred : selected;
  const outline = storyMap?.outline ?? {};

  const themes = unique([
    ...listFromOutline(outline.themes),
    ...cards.flatMap((card) => card.themes ?? [])
  ]).slice(0, 10);

  const people = unique([
    ...listFromOutline(outline.people),
    ...cards.flatMap((card) => card.people ?? [])
  ]).slice(0, 10);

  const places = unique([
    ...listFromOutline(outline.places),
    ...cards.flatMap((card) => card.places ?? [])
  ]).slice(0, 10);

  const strongestQuotes = cards
    .map((card) => clean(card.quote))
    .filter(Boolean)
    .slice(0, 8);

  const sectionCards = cards.slice(0, 8);
  const fallbackSections = category.defaultSections.map((title) => ({
    title,
    summary: "Use Memory Cards and interview notes to draft this section.",
    source_cards: [] as string[],
    quotes: [] as string[]
  }));

  const generatedSections = sectionCards.map((card, index) => ({
    title: clean(card.title) || category.defaultSections[index] || "Story section",
    summary: clean(card.summary) || "Draft this section from the selected Memory Card.",
    source_cards: [clean(card.title)].filter(Boolean),
    quotes: clean(card.quote) ? [clean(card.quote)] : []
  }));

  const sections = generatedSections.length ? generatedSections : fallbackSections;

  const titleBase = subjectName || roomTitle || category.label;

  return {
    title: `${titleBase} — ${category.label}`,
    category_key: category.key,
    category_label: category.label,
    plain_language_promise: category.plainLanguage,
    capsule_status_note: "Draft Capsule assembled from the current Story Map and Memory Cards. Staff should edit sections, attach final assets, and prepare the family preview.",
    story_focus: clean(outline.story_focus) || titleBase,
    themes,
    people,
    places,
    included_assets: [
      "Edited story sections",
      "Selected pull quotes",
      "Photo/object caption placeholders",
      "Voice excerpt placeholders",
      "Printable keepsake draft"
    ],
    sections,
    strongest_quotes: strongestQuotes,
    open_questions: clean(outline.open_questions) || category.nextQuestion,
    production_next_steps: [
      "Edit each Capsule section for clarity and emotional accuracy.",
      "Attach final photos, objects, recipes, documents, or voice excerpts.",
      "Confirm names, dates, places, and sensitive details.",
      "Publish the family preview when the draft is coherent.",
      "Prepare final PDF or keepsake export after family review."
    ],
    family_preview_copy: "Your Story Map has been turned into a draft Story Capsule. This preview shows the structure, selected memories, quotes, and materials that will become the finished keepsake."
  };
}
