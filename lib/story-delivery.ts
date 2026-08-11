import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "./supabase/admin";
import { finishedDeliveryAssetsSchema } from "./story-product";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

function safeRoomPath(roomId: string, path: string) {
  return path.startsWith(`${roomId}/`) && !path.includes("..") && !path.startsWith("/");
}

export function verifyStoryDropPreviewAsset(
  storyRoomId: string,
  preview: { storage_bucket?: string | null; storage_path?: string | null }
) {
  const approvedBucket = process.env.STORY_PREVIEW_BUCKET ?? "story-previews";
  return Boolean(
    preview.storage_bucket === approvedBucket &&
    preview.storage_path &&
    safeRoomPath(storyRoomId, preview.storage_path)
  );
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function deliveryManifestDigest(manifest: unknown) {
  const parsed = finishedDeliveryAssetsSchema.safeParse(manifest);
  if (!parsed.success) return null;
  return createHash("sha256").update(canonicalJson(parsed.data)).digest("hex");
}

export function verifyFinishedDeliveryAttestation(
  storyRoomId: string,
  delivery: {
    delivered_assets?: unknown;
    verified_manifest_sha256?: string | null;
    verified_at?: string | null;
  }
) {
  const parsed = finishedDeliveryAssetsSchema.safeParse(delivery.delivered_assets);
  const digest = deliveryManifestDigest(delivery.delivered_assets);
  if (!parsed.success || !digest || !delivery.verified_at || digest !== delivery.verified_manifest_sha256) return false;

  const approvedBucket = process.env.STORY_DELIVERY_BUCKET ?? "story-deliveries";
  const assets = [parsed.data.recording, parsed.data.transcript, parsed.data.archive].filter(
    (asset): asset is NonNullable<typeof asset> => Boolean(asset)
  );

  return assets.every((asset) => asset.bucket === approvedBucket && safeRoomPath(storyRoomId, asset.path));
}

// This expensive check belongs in a production-finalization job, never in
// Checkout or a Stripe webhook. Its digest becomes the small immutable
// attestation verified by the customer-facing payment path.
export async function auditFinishedDeliveryStorage(
  admin: AdminClient,
  storyRoomId: string,
  manifest: unknown
) {
  const parsed = finishedDeliveryAssetsSchema.safeParse(manifest);
  if (!parsed.success) return null;

  const approvedBucket = process.env.STORY_DELIVERY_BUCKET ?? "story-deliveries";
  const assets = [parsed.data.recording, parsed.data.transcript, parsed.data.archive].filter(
    (asset): asset is NonNullable<typeof asset> => Boolean(asset)
  );

  for (const asset of assets) {
    if (asset.bucket !== approvedBucket || !safeRoomPath(storyRoomId, asset.path)) return null;

    const { data: object, error: downloadError } = await admin.storage
      .from(asset.bucket)
      .download(asset.path);
    if (downloadError || !object || object.size !== asset.bytes) return null;
    const digest = createHash("sha256")
      .update(Buffer.from(await object.arrayBuffer()))
      .digest("hex");
    if (digest.toLowerCase() !== asset.sha256.toLowerCase()) return null;
  }

  return deliveryManifestDigest(parsed.data);
}
