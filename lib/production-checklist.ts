export type ProductionChecklistInput = {
  contributionCount: number;
  needsReviewCount: number;
  approvedCount: number;
  memoryCardCount: number;
  selectedMemoryCardCount: number;
  storyMapCount: number;
  artifactCount: number;
  capsuleCount: number;
  voiceCount?: number;
  photoCount?: number;
};

export type ProductionChecklistItem = {
  key: string;
  label: string;
  detail: string;
  complete: boolean;
  nextAction: string;
};

export function buildProductionChecklist(input: ProductionChecklistInput): ProductionChecklistItem[] {
  return [
    {
      key: "contributions",
      label: "Gather enough raw material",
      detail: "The room needs family memories, questions, photos, voice notes, recipes, objects, or documents before the Story Map is useful.",
      complete: input.contributionCount >= 5,
      nextAction: "Invite relatives or add more memories until there are at least five useful contributions."
    },
    {
      key: "review",
      label: "Review incoming contributions",
      detail: "Raw submissions need to be approved, archived, or marked for follow-up so the project does not become a pile of unsorted material.",
      complete: input.contributionCount > 0 && input.needsReviewCount === 0,
      nextAction: "Open each contribution and decide: approve, archive, or needs follow-up."
    },
    {
      key: "anchors",
      label: "Secure physical or voice anchors",
      detail: "Strong Capsules usually need at least one physical anchor or voice anchor: a photo, object, room, recipe, document, or recording.",
      complete: input.artifactCount > 0 || Boolean(input.voiceCount && input.voiceCount > 0) || Boolean(input.photoCount && input.photoCount > 0),
      nextAction: "Ask for one photo/object upload or one voice memory before the guided session."
    },
    {
      key: "memory_cards",
      label: "Create Memory Cards",
      detail: "Memory Cards turn raw contributions into usable story blocks with summary, quote, people, places, themes, and follow-up needs.",
      complete: input.memoryCardCount >= 3,
      nextAction: "Use draft suggestions or create edited Memory Cards from the strongest approved contributions."
    },
    {
      key: "select_cards",
      label: "Select strongest story blocks",
      detail: "Selected Memory Cards become the backbone of the Story Map and interview plan.",
      complete: input.selectedMemoryCardCount >= 3,
      nextAction: "Mark at least three Memory Cards as selected for the Story Map."
    },
    {
      key: "story_map",
      label: "Build Story Map",
      detail: "The Story Map turns selected cards into themes, open questions, interview flow, and recommended output.",
      complete: input.storyMapCount > 0,
      nextAction: "Generate a Story Map from Memory Cards or create one manually."
    },
    {
      key: "capsule_record",
      label: "Create Capsule delivery record",
      detail: "The final project needs a delivery home before finished files, notes, and assets can be organized.",
      complete: input.capsuleCount > 0,
      nextAction: "Create a Story Capsule placeholder with title, slug, included assets, and delivery note."
    }
  ];
}

export function checklistPercent(items: ProductionChecklistItem[]) {
  if (!items.length) return 0;
  const complete = items.filter((item) => item.complete).length;
  return Math.round((complete / items.length) * 100);
}

export function nextChecklistAction(items: ProductionChecklistItem[]) {
  return items.find((item) => !item.complete) ?? items[items.length - 1];
}
