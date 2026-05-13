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
  required: boolean;
  whyIncomplete: string;
};

export function buildProductionChecklist(input: ProductionChecklistInput): ProductionChecklistItem[] {
  return [
    {
      key: "started_material",
      label: "Start with useful family material",
      detail: "A test or pilot project only needs one useful contribution to keep moving. More contributions improve the final Capsule, but they should not block the build path.",
      complete: input.contributionCount >= 1,
      required: true,
      whyIncomplete: "No contribution has been captured yet, so there is nothing to review, structure, or turn into a Capsule.",
      nextAction: "Add one memory, question, recipe, photo note, voice note, or starter story."
    },
    {
      key: "review",
      label: "Clear the review queue",
      detail: "Every new submission should be approved, archived, or marked for follow-up so the staff view shows what is accepted and what still needs attention.",
      complete: input.contributionCount > 0 && input.needsReviewCount === 0,
      required: true,
      whyIncomplete: `${input.needsReviewCount} contribution${input.needsReviewCount === 1 ? "" : "s"} still need a staff decision.`,
      nextAction: "Go to the Material Inbox and choose Approve, Follow up, or Archive for each item."
    },
    {
      key: "memory_cards",
      label: "Create at least one Memory Card",
      detail: "Memory Cards turn raw contributions into usable story blocks with summary, quote, people, places, themes, and follow-up needs.",
      complete: input.memoryCardCount >= 1,
      required: true,
      whyIncomplete: "The project has material, but it has not been structured into story blocks yet.",
      nextAction: "Use a draft suggestion or create one edited Memory Card from the strongest contribution."
    },
    {
      key: "story_map",
      label: "Build the Story Map",
      detail: "The Story Map is the production blueprint. It explains what the Capsule should include and what still needs to be asked before final production.",
      complete: input.storyMapCount > 0,
      required: true,
      whyIncomplete: "Memory Cards exist, but they have not been turned into a production blueprint yet.",
      nextAction: "Generate a Story Map from Memory Cards or create one manually."
    },
    {
      key: "capsule_record",
      label: "Build the draft Capsule",
      detail: "The Capsule Builder converts the Story Map and Memory Cards into a draft deliverable structure the family can understand.",
      complete: input.capsuleCount > 0,
      required: true,
      whyIncomplete: "The Story Map exists, but there is not yet a draft Capsule deliverable.",
      nextAction: "Use the Capsule Builder to create the first draft Capsule preview."
    },
    {
      key: "depth",
      label: "Add more depth if needed",
      detail: "A strong paid Capsule usually benefits from several contributions, but this is a quality recommendation, not a hard lock.",
      complete: input.contributionCount >= 5,
      required: false,
      whyIncomplete: `Only ${input.contributionCount} contribution${input.contributionCount === 1 ? "" : "s"} captured. You can still continue, but the final story may feel thin until more family material arrives.`,
      nextAction: "Invite more relatives, add more memories, or collect one more question/photo/voice note when available."
    },
    {
      key: "anchors",
      label: "Add a photo, voice, recipe, object, or document anchor",
      detail: "Anchors make the Capsule feel concrete. This is recommended for production quality but should not block a system test.",
      complete: input.artifactCount > 0 || Boolean(input.voiceCount && input.voiceCount > 0) || Boolean(input.photoCount && input.photoCount > 0),
      required: false,
      whyIncomplete: "No physical or voice anchor has been captured yet. The Capsule can continue, but it will be stronger with at least one concrete artifact.",
      nextAction: "Add one photo, recipe, object note, document, or voice memory when available."
    },
    {
      key: "select_cards",
      label: "Select strongest story blocks",
      detail: "Selecting cards helps staff identify the best material for the final Capsule, but the builder can still use non-archived cards during testing.",
      complete: input.selectedMemoryCardCount >= 1,
      required: false,
      whyIncomplete: "No Memory Cards are marked selected. The builder can still continue, but staff should eventually select the strongest cards.",
      nextAction: "Mark the strongest Memory Card as selected for the Story Map."
    }
  ];
}

export function checklistPercent(items: ProductionChecklistItem[]) {
  if (!items.length) return 0;
  const requiredItems = items.filter((item) => item.required);
  const complete = requiredItems.filter((item) => item.complete).length;
  return Math.round((complete / Math.max(1, requiredItems.length)) * 100);
}

export function optionalChecklistPercent(items: ProductionChecklistItem[]) {
  if (!items.length) return 0;
  const complete = items.filter((item) => item.complete).length;
  return Math.round((complete / items.length) * 100);
}

export function nextChecklistAction(items: ProductionChecklistItem[]) {
  return items.find((item) => item.required && !item.complete) ?? items.find((item) => !item.complete) ?? items[items.length - 1];
}

export function requiredBlockers(items: ProductionChecklistItem[]) {
  return items.filter((item) => item.required && !item.complete);
}

export function recommendations(items: ProductionChecklistItem[]) {
  return items.filter((item) => !item.required && !item.complete);
}
