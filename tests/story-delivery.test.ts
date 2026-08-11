import { describe, expect, it } from "vitest";
import {
  deliveryManifestDigest,
  verifyFinishedDeliveryAttestation,
  verifyStoryDropPreviewAsset
} from "../lib/story-delivery";

const manifest = {
  recording: {
    bucket: "story-deliveries",
    path: "room-123/recording.m4a",
    bytes: 8_192,
    sha256: "a".repeat(64)
  },
  transcript: {
    bucket: "story-deliveries",
    path: "room-123/transcript.pdf",
    bytes: 4_096,
    sha256: "b".repeat(64)
  }
};

describe("private delivery boundaries", () => {
  it("accepts only an attested manifest inside the owning room prefix", () => {
    const digest = deliveryManifestDigest(manifest);
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyFinishedDeliveryAttestation("room-123", {
      delivered_assets: manifest,
      verified_manifest_sha256: digest,
      verified_at: "2026-08-11T00:00:00.000Z"
    })).toBe(true);
    expect(verifyFinishedDeliveryAttestation("another-room", {
      delivered_assets: manifest,
      verified_manifest_sha256: digest,
      verified_at: "2026-08-11T00:00:00.000Z"
    })).toBe(false);
  });

  it("rejects stale manifest attestations", () => {
    const changed = {
      ...manifest,
      transcript: { ...manifest.transcript, bytes: manifest.transcript.bytes + 1 }
    };
    expect(verifyFinishedDeliveryAttestation("room-123", {
      delivered_assets: changed,
      verified_manifest_sha256: deliveryManifestDigest(manifest),
      verified_at: "2026-08-11T00:00:00.000Z"
    })).toBe(false);
  });

  it("signs Story Drops only from the private preview bucket and room prefix", () => {
    expect(verifyStoryDropPreviewAsset("room-123", {
      storage_bucket: "story-previews",
      storage_path: "room-123/drop-01.m4a"
    })).toBe(true);
    expect(verifyStoryDropPreviewAsset("room-123", {
      storage_bucket: "story-previews",
      storage_path: "room-999/drop-01.m4a"
    })).toBe(false);
    expect(verifyStoryDropPreviewAsset("room-123", {
      storage_bucket: "public",
      storage_path: "room-123/drop-01.m4a"
    })).toBe(false);
  });
});
