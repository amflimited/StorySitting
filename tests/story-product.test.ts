import { describe, expect, it } from "vitest";
import {
  isFinishedDeliveryReady,
  highestResultOfferForPaidTotal,
  nextSponsorAction,
  resultUpgradeAmountCents,
  sponsorActionForStatus,
  sponsorMilestoneIndex,
  sponsoredStoryIntakeSchema,
  sponsorStageForStatus,
  sponsorStatusFromEvidence
} from "../lib/story-product";

describe("sponsored StorySitting product flow", () => {
  it("maps legacy production statuses into the sponsor journey", () => {
    expect(sponsorStageForStatus("onboarding").id).toBe("start");
    expect(sponsorStageForStatus("ready_for_interview").id).toBe("scheduled");
    expect(sponsorStageForStatus("delivered").id).toBe("shelf");
    expect(sponsorStageForStatus("story_ready").id).toBe("story_drop");
    expect(sponsorStageForStatus("interview_complete").id).toBe("review");
    expect(sponsorStageForStatus("permission_granted").label).not.toContain("scheduled");
    expect(sponsorStageForStatus("permission_declined").shortLabel).toBe("Stopped");
  });

  it("never moves the customer journey backward while a preview is produced", () => {
    expect(sponsorMilestoneIndex("interview_complete")).toBe(3);
    expect(sponsorMilestoneIndex("interview_needs_review")).toBe(3);
    expect(sponsorMilestoneIndex("story_in_production")).toBe(3);
    expect(sponsorMilestoneIndex("story_ready")).toBe(3);
    expect(sponsorMilestoneIndex("delivered")).toBe(4);
  });

  it("keeps the next action customer-facing", () => {
    expect(nextSponsorAction("permission_pending", "Grandpa Ray")).toContain("Family Pass");
    expect(nextSponsorAction("story_ready", "Grandpa Ray")).toContain("private preview");
    expect(sponsorActionForStatus("story_ready").detail).toContain("$39");
    expect(sponsorActionForStatus("delivered").detail).toContain("new $5 Story Start");
  });

  it("charges only the difference between result editions", () => {
    expect(resultUpgradeAmountCents("voice", 0)).toBe(3900);
    expect(resultUpgradeAmountCents("story", 3900)).toBe(4000);
    expect(resultUpgradeAmountCents("heirloom", 7900)).toBe(7000);
    expect(highestResultOfferForPaidTotal(7899)?.id).toBe("voice");
    expect(highestResultOfferForPaidTotal(14900)?.id).toBe("heirloom");
  });

  it("uses customer-visible chapter evidence when a room status is stale", () => {
    expect(sponsorStatusFromEvidence("story_ready", { chapterStatus: "delivered" })).toBe("delivered");
    expect(sponsorStatusFromEvidence("story_in_production", { chapterStatus: "sponsor_preview" })).toBe("story_ready");
    expect(sponsorStatusFromEvidence("permission_pending", { chapterStatus: null })).toBe("permission_pending");
  });

  it("requires the sponsor to request contact without impersonating storyteller consent", () => {
    const result = sponsoredStoryIntakeSchema.safeParse({
      buyer_name: "Mara",
      buyer_email: "mara@example.com",
      relationship: "granddaughter",
      storyteller_name: "Grandpa Ray",
      storyteller_phone: "+13175550123",
      storyteller_timezone: "America/Indiana/Indianapolis",
      best_times: "Weekday mornings",
      story_seeds: ["How he met Lorraine"],
      personal_introduction: "I have wanted to save this story.",
      permission_path: "family_pass",
      sponsor_contact_authorized: true,
      website: ""
    });

    expect(result.success).toBe(true);
  });

  it("requires prose, provenance, recording, and transcript before selling a result", () => {
    const complete = {
      body: "A finished chapter.",
      source_map: [{ paragraph: 1, start_seconds: 12 }],
      delivered_assets: {
        recording: { bucket: "story-deliveries", path: "room/call.mp3", bytes: 2048, sha256: "a".repeat(64) },
        transcript: { bucket: "story-deliveries", path: "room/transcript.pdf", bytes: 1024, sha256: "b".repeat(64) }
      }
    };

    expect(isFinishedDeliveryReady(complete)).toBe(true);
    expect(isFinishedDeliveryReady({ ...complete, source_map: [] })).toBe(false);
    expect(isFinishedDeliveryReady({ ...complete, delivered_assets: {} })).toBe(false);
    expect(isFinishedDeliveryReady({
      ...complete,
      delivered_assets: {
        ...complete.delivered_assets,
        recording: { ...complete.delivered_assets.recording, bytes: 0 }
      }
    })).toBe(false);
  });
});
