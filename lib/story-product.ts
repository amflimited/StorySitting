import { z } from "zod";

export const STORY_START_PRICE_CENTS = 500;
export const FINISHED_SITTING_PRICE_CENTS = 7900;

export const resultOfferIds = ["voice", "story", "heirloom"] as const;
export type ResultOfferId = (typeof resultOfferIds)[number];

export type ResultOffer = {
  id: ResultOfferId;
  name: string;
  layer: string;
  priceCents: number;
  description: string;
  features: readonly string[];
  correctionRounds: number;
};

export const RESULT_OFFERS: readonly ResultOffer[] = [
  {
    id: "voice",
    name: "Voice Edition",
    layer: "Source",
    priceCents: 3900,
    description: "Keep the complete voice and a readable record.",
    features: ["Full original recording", "Readable transcript", "Permission record", "Portable downloads"],
    correctionRounds: 0
  },
  {
    id: "story",
    name: "Story Edition",
    layer: "Narrative",
    priceCents: 7900,
    description: "Keep the source and the finished, traceable story.",
    features: ["Everything in Voice", "Source-linked finished chapter", "Complete family archive", "One correction round"],
    correctionRounds: 1
  },
  {
    id: "heirloom",
    name: "Heirloom Edition",
    layer: "Heirloom",
    priceCents: 14900,
    description: "Add family artifacts and a designed edition made for the shelf.",
    features: ["Everything in Story", "Print-ready heirloom PDF", "Layout for up to 12 artifacts", "Two correction rounds total"],
    correctionRounds: 2
  }
] as const;

export function resultOffer(offerId: string | null | undefined) {
  return RESULT_OFFERS.find((offer) => offer.id === offerId) ?? null;
}

export function resultUpgradeAmountCents(targetId: ResultOfferId, paidTotalCents = 0) {
  const target = resultOffer(targetId);
  if (!target) throw new Error("Unknown result edition.");
  return Math.max(0, target.priceCents - paidTotalCents);
}

export function highestResultOfferForPaidTotal(paidTotalCents: number) {
  return [...RESULT_OFFERS].reverse().find((offer) => paidTotalCents >= offer.priceCents) ?? null;
}

export const permissionPaths = ["family_pass", "human_hello", "call_us"] as const;
export type PermissionPath = (typeof permissionPaths)[number];

export const sponsoredStoryIntakeSchema = z.object({
  buyer_name: z.string().trim().min(2).max(100),
  buyer_email: z.email().max(254),
  relationship: z.string().trim().min(2).max(80),
  storyteller_name: z.string().trim().min(1).max(100),
  storyteller_phone: z.string().trim().min(7).max(30),
  storyteller_timezone: z.string().trim().max(80).optional().default(""),
  best_times: z.string().trim().min(2).max(300),
  story_seeds: z.array(z.string().trim().min(2).max(300)).min(1).max(5),
  story_shape: z.enum(["open", "moment", "person", "place", "tradition", "lesson"]).optional().default("open"),
  artifact_note: z.string().trim().max(500).optional().default(""),
  family_context: z.string().trim().max(500).optional().default(""),
  personal_introduction: z.string().trim().max(500).optional().default(""),
  permission_path: z.enum(permissionPaths),
  sponsor_contact_authorized: z.literal(true),
  website: z.string().max(0).optional().default("")
});

export const finishedDeliveryAssetsSchema = z.object({
  recording: z.object({
    bucket: z.string().min(1),
    path: z.string().min(1),
    bytes: z.number().int().positive().max(104_857_600),
    sha256: z.string().regex(/^[a-f0-9]{64}$/i)
  }),
  transcript: z.object({
    bucket: z.string().min(1),
    path: z.string().min(1),
    bytes: z.number().int().positive().max(104_857_600),
    sha256: z.string().regex(/^[a-f0-9]{64}$/i)
  }),
  archive: z.object({
    bucket: z.string().min(1),
    path: z.string().min(1),
    bytes: z.number().int().positive().max(104_857_600),
    sha256: z.string().regex(/^[a-f0-9]{64}$/i)
  }).optional(),
  heirloomPdf: z.object({
    bucket: z.string().min(1),
    path: z.string().min(1),
    bytes: z.number().int().positive().max(104_857_600),
    sha256: z.string().regex(/^[a-f0-9]{64}$/i)
  }).optional()
});

export function isFinishedDeliveryReady(input: {
  body?: string | null;
  source_map?: unknown;
  delivered_assets?: unknown;
}) {
  return Boolean(
    input.body?.trim().length &&
    Array.isArray(input.source_map) &&
    input.source_map.length > 0 &&
    finishedDeliveryAssetsSchema.safeParse(input.delivered_assets).success
  );
}

export type SponsoredStoryIntake = z.infer<typeof sponsoredStoryIntakeSchema>;

export type SponsorStage =
  | "start"
  | "permission"
  | "scheduled"
  | "sitting"
  | "story_drop"
  | "review"
  | "shelf";

export type SponsorStageDefinition = {
  id: SponsorStage;
  label: string;
  shortLabel: string;
  description: string;
  owner: "You" | "Storyteller" | "StorySitting" | "Family";
};

export const SPONSOR_STAGES: SponsorStageDefinition[] = [
  {
    id: "start",
    label: "Story Start funded",
    shortLabel: "$5 start",
    description: "You opened one Story Start and gave the interviewer useful family context.",
    owner: "You"
  },
  {
    id: "permission",
    label: "Permission handshake",
    shortLabel: "Their choice",
    description: "The storyteller chooses for themself, then a human verifies the choice before any AI interview.",
    owner: "Storyteller"
  },
  {
    id: "scheduled",
    label: "Sitting scheduled",
    shortLabel: "Scheduled",
    description: "The authorized phone sitting has a real time. The storyteller needs no app or account.",
    owner: "StorySitting"
  },
  {
    id: "sitting",
    label: "Story sitting",
    shortLabel: "Phone sitting",
    description: "The storyteller hears a fresh disclosure, can stop at any time, and tells the story in their own voice.",
    owner: "Storyteller"
  },
  {
    id: "review",
    label: "Private preview in production",
    shortLabel: "Being made",
    description: "StorySitting checks the source audio, transcript, names, privacy, and strongest moment before offering anything to buy.",
    owner: "StorySitting"
  },
  {
    id: "story_drop",
    label: "Private preview ready",
    shortLabel: "Hear it first",
    description: "You hear the strongest moment before choosing a $39 Voice, $79 Story, or $149 Heirloom Edition.",
    owner: "You"
  },
  {
    id: "shelf",
    label: "Complete result kept",
    shortLabel: "Kept result",
    description: "The full recording, transcript, source-linked chapter, and correction pass are unlocked for the family.",
    owner: "Family"
  }
];

export type SponsorMilestone = {
  id: "start" | "permission" | "sitting" | "preview" | "kept";
  label: string;
  owner: string;
  description: string;
  price?: string;
};

export const SPONSOR_MILESTONES: SponsorMilestone[] = [
  {
    id: "start",
    label: "Story Start",
    owner: "You",
    description: "Open one project and fund the trusted permission work.",
    price: "$5 once"
  },
  {
    id: "permission",
    label: "Their permission",
    owner: "Storyteller",
    description: "They independently choose, and a human verifies the choice."
  },
  {
    id: "sitting",
    label: "Phone sitting",
    owner: "StorySitting",
    description: "After a verified yes, we schedule and conduct the call."
  },
  {
    id: "preview",
    label: "Private preview",
    owner: "StorySitting",
    description: "We finish and quality-check a real moment before asking for more money.",
    price: "$0 charged"
  },
  {
    id: "kept",
    label: "Keep the result",
    owner: "You",
    description: "Only after listening, choose how many layers the family wants to keep.",
    price: "$39–$149 optional"
  }
];

const statusToStage: Record<string, SponsorStage> = {
  awaiting_checkout: "start",
  start_paid: "permission",
  permission_pending: "permission",
  permission_granted: "permission",
  interview_scheduled: "scheduled",
  ready_for_interview: "scheduled",
  interview_in_progress: "sitting",
  interview_complete: "review",
  interview_complete_needs_review: "review",
  interview_needs_review: "review",
  story_in_production: "review",
  capsule_production: "review",
  story_ready: "story_drop",
  delivered: "shelf",
  complete: "shelf",
  onboarding: "start",
  gathering: "permission",
  review: "scheduled",
  mapping: "scheduled"
};

export function sponsorStageForStatus(status?: string | null): SponsorStageDefinition {
  if (status === "permission_declined") {
    return {
      id: "permission",
      label: "Storyteller declined",
      shortLabel: "Stopped",
      description: "Their choice is final for this Story Start. No interview or result-edition charge will follow.",
      owner: "Storyteller"
    };
  }
  if (status === "closed") {
    return {
      id: "start",
      label: "Story Start closed",
      shortLabel: "Closed",
      description: "This Story Start is closed. Nothing is scheduled and no finished-result charge can be created.",
      owner: "StorySitting"
    };
  }
  if (status === "story_ready") {
    return {
      id: "story_drop",
      label: "Private preview ready",
      shortLabel: "Hear it first",
      description: "Listen first. Then choose the $39 Voice, $79 Story, $149 Heirloom, or nothing more.",
      owner: "You"
    };
  }
  if (status === "interview_needs_review") {
    return {
      id: "review",
      label: "Sitting needs a human review",
      shortLabel: "Reviewing",
      description: "The call did not finish cleanly. A StorySitter is reviewing it before any preview or result is promised.",
      owner: "StorySitting"
    };
  }
  const stageId = statusToStage[status ?? ""] ?? "start";
  return SPONSOR_STAGES.find((stage) => stage.id === stageId) ?? SPONSOR_STAGES[0];
}

export function sponsorStatusFromEvidence(
  roomStatus?: string | null,
  evidence?: { chapterStatus?: string | null; hasPaidDelivery?: boolean }
) {
  if (evidence?.hasPaidDelivery || evidence?.chapterStatus === "delivered") return "delivered";
  if (["sponsor_preview", "approved"].includes(evidence?.chapterStatus ?? "")) return "story_ready";
  return roomStatus ?? null;
}

export function sponsorStageIndex(status?: string | null) {
  const current = sponsorStageForStatus(status);
  return SPONSOR_STAGES.findIndex((stage) => stage.id === current.id);
}

export function sponsorMilestoneIndex(status?: string | null) {
  if (status === "closed") return 0;
  const stage = sponsorStageForStatus(status).id;
  if (stage === "start") return 0;
  if (stage === "permission") return 1;
  if (stage === "scheduled" || stage === "sitting") return 2;
  if (stage === "review" || stage === "story_drop") return 3;
  return 4;
}

export type SponsorAction = {
  owner: "You" | "Storyteller" | "StorySitting" | "No action due";
  title: string;
  detail: string;
  kind: "start" | "send_pass" | "wait" | "question" | "preview" | "result" | "stopped";
};

export function sponsorActionForStatus(status?: string | null, storytellerName = "your storyteller"): SponsorAction {
  if (status === "permission_declined") {
    return {
      owner: "No action due",
      title: `Respect ${storytellerName}’s choice.`,
      detail: "This Story Start stops here. There will be no sitting and no result edition charge.",
      kind: "stopped"
    };
  }
  if (status === "closed") {
    return {
      owner: "No action due",
      title: "This Story Start is closed.",
      detail: "Nothing is scheduled. Start again only if the storyteller asks you to.",
      kind: "stopped"
    };
  }
  if (status === "story_ready") {
    return {
      owner: "You",
      title: "Listen to the private preview.",
      detail: "Then choose deliberately: leave it there for $0 more, keep the Voice for $39, the Story for $79, or the Heirloom for $149.",
      kind: "preview"
    };
  }
  if (status === "interview_needs_review" || status === "interview_complete_needs_review") {
    return {
      owner: "StorySitting",
      title: "We are checking the sitting by hand.",
      detail: "You do not need to fix anything. We will not promise a preview or offer an edition until the source is usable.",
      kind: "wait"
    };
  }
  switch (sponsorStageForStatus(status).id) {
    case "start":
      return {
        owner: "You",
        title: "Finish the $5 Story Start.",
        detail: "Add one useful family question and choose how to begin the permission handoff.",
        kind: "start"
      };
    case "permission":
      return status === "permission_granted"
        ? {
            owner: "StorySitting",
            title: "We are confirming a real call time.",
            detail: `${storytellerName} has given verified permission. Nothing else is required from you right now.`,
            kind: "wait"
          }
        : {
            owner: "You",
            title: "Send the private Family Pass.",
            detail: `Send the link and family code from your own phone. ${storytellerName} still decides independently, and StorySitting verifies that decision.`,
            kind: "send_pass"
          };
    case "scheduled":
      return {
        owner: "You",
        title: "Add one last question only family would know to ask.",
        detail: "The sitting has a real time. Adding context is optional; the storyteller can still pause or stop the call.",
        kind: "question"
      };
    case "sitting":
      return {
        owner: "Storyteller",
        title: "The sitting is underway.",
        detail: "There is nothing to do in the app. StorySitting is listening and preserving the source audio.",
        kind: "wait"
      };
    case "review":
      return {
        owner: "StorySitting",
        title: "We are making the private preview.",
        detail: "We are checking the audio, transcript, names, privacy, and strongest moment. No edition charge happens here.",
        kind: "wait"
      };
    case "story_drop":
      return {
        owner: "You",
        title: "Listen before you buy anything else.",
        detail: "The preview is private. Keep the Voice, Story, or Heirloom Edition only if the right layer feels worth preserving.",
        kind: "preview"
      };
    case "shelf":
      return {
        owner: "You",
        title: "Keep, share, or ask the next question.",
        detail: "The result is unlocked. Another sitting starts only when you deliberately open a new $5 Story Start.",
        kind: "result"
      };
  }
}

export function nextSponsorAction(status?: string | null, storytellerName = "your storyteller") {
  return sponsorActionForStatus(status, storytellerName).title;
}

export function formatPrice(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(cents / 100);
}
