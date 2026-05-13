export type ContributionLike = {
  contribution_type: string | null;
  review_status: string | null;
};

export type StoryReadinessInput = {
  inviteCount: number;
  contributionCount: number;
  approvedCount: number;
  contributions: ContributionLike[];
  whyNow?: string | null;
  knownMaterials?: string | null;
};

export type StoryReadiness = {
  score: number;
  phase: "gathering" | "map_ready" | "session_ready" | "capsule_ready";
  label: string;
  summary: string;
  counts: {
    invites: number;
    contributions: number;
    approved: number;
    memory: number;
    photo: number;
    voice: number;
    question: number;
    recipe: number;
    document: number;
  };
  nextActions: string[];
};

function countTypes(contributions: ContributionLike[]) {
  const has = (types: string[]) =>
    contributions.filter((item) => item.contribution_type && types.includes(item.contribution_type)).length;

  return {
    memory: has(["memory", "note", "summary", "transcript"]),
    photo: has(["photo"]),
    voice: has(["audio", "transcript", "summary"]),
    question: has(["question"]),
    recipe: has(["recipe"]),
    document: has(["document"])
  };
}

export function calculateStoryReadiness(input: StoryReadinessInput): StoryReadiness {
  const contributions = input.contributions ?? [];
  const typeCounts = countTypes(contributions);
  const hasWhyNow = Boolean(input.whyNow?.trim());
  const hasKnownMaterials = Boolean(input.knownMaterials?.trim());

  let score = 0;
  score += Math.min(input.inviteCount, 4) * 7;
  score += Math.min(input.contributionCount, 8) * 5;
  score += Math.min(input.approvedCount, 6) * 4;
  if (typeCounts.memory > 0) score += 12;
  if (typeCounts.photo > 0) score += 10;
  if (typeCounts.voice > 0) score += 12;
  if (typeCounts.question > 0) score += 7;
  if (typeCounts.recipe > 0 || typeCounts.document > 0) score += 7;
  if (hasWhyNow) score += 6;
  if (hasKnownMaterials) score += 6;
  score = Math.min(100, score);

  const nextActions: string[] = [];
  if (input.inviteCount < 3) nextActions.push("Invite at least three relatives so the project is not dependent on one memory source.");
  if (input.contributionCount < 5) nextActions.push("Gather at least five contributions before treating the Story Map as reliable.");
  if (typeCounts.voice === 0) nextActions.push("Capture at least one voice contribution; voice is a major StorySitting differentiator.");
  if (typeCounts.photo === 0) nextActions.push("Add photos or object images so captions and memory cards have physical anchors.");
  if (typeCounts.question === 0) nextActions.push("Collect family questions before the session so the interview is guided by what relatives actually want to know.");
  if (input.approvedCount < 3 && input.contributionCount > 0) nextActions.push("Approve or archive incoming contributions so staff can start creating Memory Cards.");
  if (!hasWhyNow) nextActions.push("Record the reason this matters now: move, birthday, reunion, home sale, health concern, or family transition.");

  let phase: StoryReadiness["phase"] = "gathering";
  let label = "Still gathering";
  let summary = "Keep collecting relatives, memories, photos, questions, and voice notes.";

  if (score >= 45) {
    phase = "map_ready";
    label = "Story Map ready";
    summary = "There is enough material to draft a lightweight Story Map and identify missing questions.";
  }
  if (score >= 68) {
    phase = "session_ready";
    label = "Session ready";
    summary = "The room has enough signal to prepare a guided Signature Session.";
  }
  if (score >= 86) {
    phase = "capsule_ready";
    label = "Capsule production ready";
    summary = "The project has strong enough source material for Memory Cards and Capsule assembly.";
  }

  return {
    score,
    phase,
    label,
    summary,
    counts: {
      invites: input.inviteCount,
      contributions: input.contributionCount,
      approved: input.approvedCount,
      ...typeCounts
    },
    nextActions: nextActions.slice(0, 5)
  };
}

export function productionStatusFromReadiness(readiness: StoryReadiness) {
  if (readiness.phase === "capsule_ready") return "ready for capsule assembly";
  if (readiness.phase === "session_ready") return "ready for session prep";
  if (readiness.phase === "map_ready") return "ready for story map";
  return "needs more gathering";
}
