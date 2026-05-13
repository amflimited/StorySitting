type AnyRecord = Record<string, any>;

type ContributionLike = {
  title?: string | null;
  body?: string | null;
  contribution_type?: string | null;
  review_status?: string | null;
};

type MemoryCardLike = {
  title?: string | null;
  summary?: string | null;
  quote?: string | null;
  themes?: string[] | null;
  people?: string[] | null;
  places?: string[] | null;
  life_era?: string | null;
  status?: string | null;
};

type StoryMapLike = {
  outline?: AnyRecord | null;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function toList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => clean(item)).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function statusIsAccepted(status?: string | null) {
  return ["approved", "used_in_memory_card"].includes(status ?? "");
}

export const STORY_THREADS = [
  "Favorite meals",
  "Family traditions",
  "Childhood stories",
  "Work and craft",
  "Love stories",
  "Home and place",
  "Hard times",
  "Holidays",
  "Objects with history",
  "Advice and lessons",
  "Parenthood",
  "Turning points",
  "Family legends",
  "Daily rituals",
  "Things we do not want forgotten"
];

export const DELIVERABLE_VISIBILITY = [
  {
    title: "Readable story sections",
    detail: "Edited chapters or short sections the family can actually read, share, and return to."
  },
  {
    title: "Selected pull quotes",
    detail: "The strongest lines saved for keepsake pages, cards, captions, or audio moments."
  },
  {
    title: "Photo and object captions",
    detail: "Context for recipes, rooms, objects, places, tools, and family images."
  },
  {
    title: "Voice excerpt plan",
    detail: "Moments where the voice itself matters and should be clipped or preserved."
  },
  {
    title: "Interview prompt packet",
    detail: "The next questions that will turn thin memories into usable story material."
  },
  {
    title: "Private family preview",
    detail: "A central place to review what the Capsule is becoming before final delivery."
  },
  {
    title: "Printable keepsake draft",
    detail: "A future PDF/booklet-style output once the draft has been edited and reviewed."
  }
];

export function getLatestStoryMap(storyMaps: StoryMapLike[] = []) {
  return storyMaps[0] ?? null;
}

export function buildCapsuleReadiness({
  contributions = [],
  memoryCards = [],
  storyMaps = [],
  capsules = [],
  capsuleData = {}
}: {
  contributions?: ContributionLike[];
  memoryCards?: MemoryCardLike[];
  storyMaps?: StoryMapLike[];
  capsules?: AnyRecord[];
  capsuleData?: AnyRecord;
}) {
  const accepted = contributions.filter((item) => statusIsAccepted(item.review_status)).length;
  const reviewed = contributions.filter((item) => item.review_status && item.review_status !== "needs_review").length;
  const selectedCards = memoryCards.filter((item) => item.status === "selected").length;
  const quotes = memoryCards.filter((item) => clean(item.quote)).length + toList(capsuleData.strongest_quotes).length;
  const sections = Array.isArray(capsuleData.sections) ? capsuleData.sections.length : 0;
  const themes = unique([
    ...memoryCards.flatMap((item) => item.themes ?? []),
    ...toList(capsuleData.themes)
  ]);
  const people = unique([
    ...memoryCards.flatMap((item) => item.people ?? []),
    ...toList(capsuleData.people)
  ]);
  const places = unique([
    ...memoryCards.flatMap((item) => item.places ?? []),
    ...toList(capsuleData.places)
  ]);

  const checks = [
    contributions.length > 0,
    contributions.length === 0 || reviewed === contributions.length,
    accepted > 0,
    memoryCards.length > 0,
    selectedCards > 0,
    themes.length > 0,
    quotes > 0,
    storyMaps.length > 0,
    capsules.length > 0 || sections > 0
  ];

  const score = Math.round((checks.filter(Boolean).length / checks.length) * 100);
  const label = score >= 85 ? "Draft-ready" : score >= 65 ? "Interview-ready" : score >= 40 ? "Needs shaping" : "Needs material";

  let nextAction = "Open the Capsule preview and edit the draft into a real family-facing artifact.";
  if (contributions.length === 0) nextAction = "Add one real memory, recipe, question, photo note, or voice note.";
  else if (contributions.length > 0 && reviewed < contributions.length) nextAction = "Review the material inbox so every contribution has a decision.";
  else if (memoryCards.length === 0) nextAction = "Turn accepted material into at least one Memory Card.";
  else if (selectedCards === 0) nextAction = "Select the strongest Memory Card for the Story Map.";
  else if (storyMaps.length === 0) nextAction = "Generate the Story Map so the Capsule has a blueprint.";
  else if (capsules.length === 0 && sections === 0) nextAction = "Use Capsule Builder to create the first draft deliverable.";

  const estimatedRemaining = score >= 85 ? "1 review pass" : score >= 65 ? "1 interview or edit pass" : score >= 40 ? "2–3 production steps" : "more gathering needed";

  return {
    score,
    label,
    nextAction,
    estimatedRemaining,
    counts: {
      contributions: contributions.length,
      accepted,
      reviewed,
      memoryCards: memoryCards.length,
      selectedCards,
      storyMaps: storyMaps.length,
      capsules: capsules.length,
      quotes,
      themes: themes.length,
      people: people.length,
      places: places.length
    },
    strengths: [
      accepted > 0 ? "accepted family material" : "",
      memoryCards.length > 0 ? "structured Memory Cards" : "",
      selectedCards > 0 ? "selected story blocks" : "",
      storyMaps.length > 0 ? "Story Map blueprint" : "",
      capsules.length > 0 || sections > 0 ? "draft Capsule" : ""
    ].filter(Boolean),
    weakAreas: detectStoryGaps({ contributions, memoryCards, storyMaps, capsuleData })
  };
}

export function detectStoryGaps({
  contributions = [],
  memoryCards = [],
  storyMaps = [],
  capsuleData = {}
}: {
  contributions?: ContributionLike[];
  memoryCards?: MemoryCardLike[];
  storyMaps?: StoryMapLike[];
  capsuleData?: AnyRecord;
}) {
  const contributionTypes = unique(contributions.map((item) => item.contribution_type ?? ""));
  const themes = unique([
    ...memoryCards.flatMap((item) => item.themes ?? []),
    ...toList(capsuleData.themes)
  ].map((item) => item.toLowerCase()));
  const people = unique(memoryCards.flatMap((item) => item.people ?? []));
  const places = unique(memoryCards.flatMap((item) => item.places ?? []));
  const quotes = memoryCards.filter((item) => clean(item.quote)).length + toList(capsuleData.strongest_quotes).length;
  const gaps: { label: string; detail: string; action: string }[] = [];

  if (!contributionTypes.includes("audio") && !contributionTypes.includes("transcript") && !contributionTypes.includes("summary")) {
    gaps.push({
      label: "Voice coverage is low",
      detail: "The Capsule has written material but little or no actual voice texture yet.",
      action: "Record one short voice story or add a transcript from the subject or a close relative."
    });
  }

  if (!contributionTypes.includes("photo")) {
    gaps.push({
      label: "Photo/object anchors are missing",
      detail: "The story can continue, but concrete images, recipes, cards, rooms, or objects will make the final Capsule feel real.",
      action: "Add one photo, recipe card, object note, or document caption."
    });
  }

  if (quotes < 2) {
    gaps.push({
      label: "Not enough quotable lines",
      detail: "Pull quotes are what make a Capsule feel personal instead of summarized.",
      action: "Ask for one direct memory in the person’s own words."
    });
  }

  if (people.length < 2) {
    gaps.push({
      label: "Few people are connected",
      detail: "A family Capsule becomes stronger when it shows who was involved, not only what happened.",
      action: "Ask who was there, who taught it, who remembers it, or who should be named."
    });
  }

  if (places.length < 1 && !themes.includes("home")) {
    gaps.push({
      label: "Place context is thin",
      detail: "Even recipe and milestone stories usually need rooms, homes, churches, tables, workplaces, or towns to feel grounded.",
      action: "Add where this happened and what the place looked, sounded, or smelled like."
    });
  }

  if (storyMaps.length === 0) {
    gaps.push({
      label: "No Story Map yet",
      detail: "The project has material, but no blueprint for what the final Capsule should become.",
      action: "Generate the Story Map from selected Memory Cards."
    });
  }

  return gaps.slice(0, 5);
}

export function buildLiveNarrativePreview({
  capsuleData = {},
  memoryCards = []
}: {
  capsuleData?: AnyRecord;
  memoryCards?: MemoryCardLike[];
}) {
  const sections = Array.isArray(capsuleData.sections) ? capsuleData.sections : [];
  const source = sections.length
    ? sections.map((section: AnyRecord) => ({
        title: clean(section.title) || "Draft section",
        excerpt: clean(section.summary) || "This section is ready for staff editing.",
        quotes: Array.isArray(section.quotes) ? section.quotes.map(String) : [],
        linkedMemories: Array.isArray(section.source_cards) ? section.source_cards.map(String) : [],
        themes: toList(capsuleData.themes).slice(0, 4)
      }))
    : memoryCards.map((card) => ({
        title: clean(card.title) || "Draft chapter",
        excerpt: clean(card.summary) || "Use this Memory Card as a chapter seed.",
        quotes: clean(card.quote) ? [clean(card.quote)] : [],
        linkedMemories: [clean(card.title)].filter(Boolean),
        themes: card.themes ?? []
      }));

  return source.slice(0, 6).map((section, index) => ({
    chapterNumber: index + 1,
    title: section.title,
    excerpt: section.excerpt,
    quotes: section.quotes,
    linkedMemories: section.linkedMemories,
    themes: section.themes,
    suggestedMedia: suggestedMediaForThemes(section.themes)
  }));
}

function suggestedMediaForThemes(themes: string[] = []) {
  const normalized = themes.map((theme) => theme.toLowerCase()).join(" ");
  if (normalized.includes("recipe") || normalized.includes("food")) return ["recipe card", "kitchen photo", "voice explanation"];
  if (normalized.includes("home") || normalized.includes("place")) return ["room photo", "object photo", "address or map note"];
  if (normalized.includes("work") || normalized.includes("craft")) return ["tool photo", "workplace image", "captioned object"];
  if (normalized.includes("holiday")) return ["holiday photo", "ritual detail", "family gathering image"];
  return ["family photo", "voice clip", "captioned object"];
}

export function buildInterviewPrep({
  storyMap,
  memoryCards = [],
  capsuleData = {}
}: {
  storyMap?: StoryMapLike | null;
  memoryCards?: MemoryCardLike[];
  capsuleData?: AnyRecord;
}) {
  const outline = storyMap?.outline ?? {};
  const focus = clean(outline.story_focus) || clean(capsuleData.story_focus) || clean(capsuleData.title) || "this Story Capsule";
  const gaps = detectStoryGaps({ memoryCards, storyMaps: storyMap ? [storyMap] : [], capsuleData });
  const cardPrompts = memoryCards.slice(0, 5).map((card) => `Tell me more about “${clean(card.title) || "this memory"}.” What happened before and after it?`);

  return {
    focus,
    opening: `Start with ${focus}. Ask for the scene before facts: what did it look, sound, smell, or feel like?`,
    prompts: [
      `What should future family members understand about ${focus}?`,
      "Who was there, and who should be named correctly?",
      "What detail would disappear if nobody asked about it now?",
      "What object, recipe, room, photo, tool, or phrase should be attached to this story?",
      "What is the line or moment the family would want quoted exactly?",
      ...cardPrompts,
      ...gaps.map((gap) => gap.action)
    ].slice(0, 12),
    closing: "Close by asking: If this Capsule only saved one feeling for the family, what should that feeling be?"
  };
}

export function productionStageLabel(status?: string | null) {
  const value = status ?? "onboarding";
  const labels: Record<string, string> = {
    onboarding: "Start project",
    gathering_contributions: "Collect material",
    needs_staff_review: "Review material",
    story_map_in_progress: "Build Story Map",
    ready_for_interview: "Prepare interview",
    interview_complete: "Shape story",
    capsule_production: "Build Capsule",
    client_review: "Family review",
    delivered: "Delivered",
    archived: "Archived"
  };
  return labels[value] ?? value.replaceAll("_", " ");
}

export const PRODUCTION_COLUMNS = [
  { key: "onboarding", label: "Start" },
  { key: "gathering_contributions", label: "Gather" },
  { key: "needs_staff_review", label: "Review" },
  { key: "story_map_in_progress", label: "Map" },
  { key: "ready_for_interview", label: "Interview" },
  { key: "capsule_production", label: "Build" },
  { key: "client_review", label: "Review" },
  { key: "delivered", label: "Delivered" }
];
