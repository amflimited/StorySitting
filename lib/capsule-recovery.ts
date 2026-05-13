type AnyRecord = Record<string, any>;

export const LAUNCH_MANIFEST = [
  {
    key: "demo-flight-1",
    title: "Demo Flight 1 — Favorite Meals & Traditions",
    payload: "Grandma’s Sunday Dinner",
    goal: "Prove Story Room → contributions → Memory Cards → Story Map → draft Capsule preview.",
    status: "active"
  },
  {
    key: "demo-flight-2",
    title: "Demo Flight 2 — Life Stories",
    payload: "Parent or grandparent story",
    goal: "Prove voice, photos, timeline memories, interview prompts, and family progress.",
    status: "queued"
  },
  {
    key: "demo-flight-3",
    title: "Demo Flight 3 — Milestones & Anniversaries",
    payload: "Celebration Capsule",
    goal: "Prove multi-contributor gathering, family review, and celebratory delivery.",
    status: "queued"
  },
  {
    key: "paid-flight-1",
    title: "Paid Flight 1 — First real customer",
    payload: "First paid Signature Story Capsule",
    goal: "Prove revenue, delivery, testimonial, reusable learning, and faster reflight.",
    status: "future"
  }
];

export function statusLabel(value?: string | null) {
  return value ? value.replaceAll("_", " ") : "unknown";
}

export function buildSignals({ room, contributions = [], memoryCards = [], storyMaps = [], capsules = [] }: {
  room?: AnyRecord | null;
  contributions?: AnyRecord[];
  memoryCards?: AnyRecord[];
  storyMaps?: AnyRecord[];
  capsules?: AnyRecord[];
}) {
  const latestCapsule = capsules[0] ?? null;
  const capsuleData = latestCapsule?.capsule_data ?? {};
  const reviewed = contributions.filter((item) => item.review_status && item.review_status !== "needs_review").length;
  const approved = contributions.filter((item) => ["approved", "used_in_memory_card"].includes(item.review_status)).length;
  const quoteCount = memoryCards.filter((item) => item.quote).length + (Array.isArray(capsuleData.strongest_quotes) ? capsuleData.strongest_quotes.length : 0);

  return {
    productionStatus: room?.production_status ?? "onboarding",
    contributionCount: contributions.length,
    reviewedContributionCount: reviewed,
    approvedContributionCount: approved,
    memoryCardCount: memoryCards.length,
    selectedMemoryCardCount: memoryCards.filter((item) => item.status === "selected").length,
    storyMapCount: storyMaps.length,
    capsuleCount: capsules.length,
    voiceCount: contributions.filter((item) => ["audio", "transcript", "summary"].includes(item.contribution_type)).length,
    photoCount: contributions.filter((item) => item.contribution_type === "photo").length,
    quoteCount,
    hasCapsulePreview: Boolean(latestCapsule?.web_slug),
    familyReview: room?.production_status === "client_review" || room?.production_status === "delivered",
    delivered: Boolean(latestCapsule?.delivered_at || room?.production_status === "delivered"),
    demoMode: Boolean(capsuleData?.demo_flight),
    capsuleData
  };
}

export function buildNextMove(signals: ReturnType<typeof buildSignals>) {
  if (signals.contributionCount < 1) return { label: "Collect first material", action: "Add one memory, recipe, photo note, question, or voice note.", reason: "No story material exists yet." };
  if (signals.reviewedContributionCount < signals.contributionCount) return { label: "Review material", action: "Decide what each contribution becomes.", reason: "Unreviewed material blocks clean story shaping." };
  if (signals.memoryCardCount < 1) return { label: "Create Memory Cards", action: "Turn accepted material into story blocks.", reason: "Memory Cards are the bridge from raw material to Story Map." };
  if (signals.selectedMemoryCardCount < 1) return { label: "Select story blocks", action: "Mark the strongest Memory Card as selected.", reason: "Selected cards tell the system what should shape the Story Map." };
  if (signals.storyMapCount < 1) return { label: "Build Story Map", action: "Generate the Story Map from Memory Cards.", reason: "The Story Map is the production blueprint." };
  if (signals.capsuleCount < 1 || !signals.hasCapsulePreview) return { label: "Build draft Capsule", action: "Create the first family-facing Capsule preview.", reason: "The family needs to see what this is becoming." };
  if (!signals.familyReview) return { label: "Prepare family review", action: "Use the preview to gather corrections and missing details.", reason: "Customer-side recovery means the family understands progress without handholding." };
  if (!signals.delivered) return { label: "Prepare final delivery", action: "Complete final delivery checks and package the keepsake output.", reason: "The payload is only successful when the family receives something clear and finished." };
  return { label: "Capture postflight learning", action: "Save reusable prompts, section patterns, bottlenecks, and testimonial notes.", reason: "Every finished Capsule should make the next Capsule faster." };
}

export function buildFamilyProgress(signals: ReturnType<typeof buildSignals>) {
  const stages = [
    { label: "Material received", complete: signals.contributionCount > 0, detail: `${signals.contributionCount} contribution${signals.contributionCount === 1 ? "" : "s"} received.` },
    { label: "Stories reviewed", complete: signals.contributionCount > 0 && signals.reviewedContributionCount >= signals.contributionCount, detail: `${signals.reviewedContributionCount} reviewed.` },
    { label: "Memory Cards created", complete: signals.memoryCardCount > 0, detail: `${signals.memoryCardCount} story block${signals.memoryCardCount === 1 ? "" : "s"} created.` },
    { label: "Story Map built", complete: signals.storyMapCount > 0, detail: "The production blueprint is ready." },
    { label: "Draft Capsule preview", complete: signals.hasCapsulePreview, detail: "The family can see what the Capsule is becoming." },
    { label: "Family review", complete: signals.familyReview, detail: "Corrections, gaps, and sensitive edits are checked." },
    { label: "Final delivery", complete: signals.delivered, detail: "Final materials are prepared and delivered." }
  ];
  const score = Math.round((stages.filter((stage) => stage.complete).length / stages.length) * 100);
  const current = stages.find((stage) => !stage.complete) ?? stages[stages.length - 1];
  return { score, current, stages };
}

export function buildDeliveryChecklist(signals: ReturnType<typeof buildSignals>) {
  return [
    { label: "Readable story sections", complete: signals.hasCapsulePreview, detail: "The Capsule has draft sections the family can understand." },
    { label: "Selected pull quotes", complete: signals.quoteCount > 0, detail: "Strong lines have been saved for the final artifact." },
    { label: "Names, dates, and places checked", complete: signals.selectedMemoryCardCount > 0, detail: "Important details are confirmed or marked approximate." },
    { label: "Photo, object, recipe, or voice plan", complete: signals.photoCount > 0 || signals.voiceCount > 0, detail: "The Capsule has concrete anchors beyond plain text." },
    { label: "Family review", complete: signals.familyReview, detail: "The family has reviewed the draft." },
    { label: "Final output", complete: signals.delivered, detail: "Private preview, printable draft, or final keepsake is ready." }
  ];
}

export function buildReusableAssets(signals: ReturnType<typeof buildSignals>) {
  const data = signals.capsuleData ?? {};
  return [
    { label: "Category pattern", ready: Boolean(data.category_label), detail: data.category_label || "No category pattern yet." },
    { label: "Chapter structure", ready: Array.isArray(data.sections) && data.sections.length > 0, detail: Array.isArray(data.sections) ? `${data.sections.length} sections available.` : "No section structure yet." },
    { label: "Pull quote examples", ready: signals.quoteCount > 0, detail: `${signals.quoteCount} quote${signals.quoteCount === 1 ? "" : "s"} available.` },
    { label: "Interview prompt seed", ready: Boolean(data.open_questions), detail: data.open_questions ? "Open questions captured." : "No reusable question set yet." },
    { label: "Demo proof", ready: signals.demoMode, detail: signals.demoMode ? "Demo mode: safe internal sample." : "Requires permission before public use." }
  ];
}

export function calculateReusabilityScore(signals: ReturnType<typeof buildSignals>) {
  const assets = buildReusableAssets(signals);
  const base = assets.filter((asset) => asset.ready).length;
  const deliveryBonus = signals.delivered ? 1 : 0;
  const reviewBonus = signals.familyReview ? 1 : 0;
  return Math.round(((base + deliveryBonus + reviewBonus) / (assets.length + 2)) * 100);
}

export function buildPostflightQuestions(signals: ReturnType<typeof buildSignals>) {
  return [
    "What confused the family during this Capsule?",
    "Which contribution request produced the best memory?",
    "Which section should become a reusable template?",
    "Which quote could become proof if the family approves?",
    "What took too many manual steps?",
    "What should be improved before the next Capsule?",
    signals.delivered ? "What should be shown as the before/after proof?" : "What must happen before this can be called delivered?"
  ];
}
