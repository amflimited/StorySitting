"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  auditFinishedDeliveryStorage,
  deliveryManifestDigest
} from "@/lib/story-delivery";
import { isFinishedDeliveryReady } from "@/lib/story-product";
import { safeString } from "@/lib/utils";

const deliveryIdentitySchema = z.object({
  story_chapter_id: z.string().uuid(),
  story_room_id: z.string().uuid()
}).strict();

const finalizeDeliverySchema = deliveryIdentitySchema.extend({
  audit_confirmation: z.literal("yes")
}).strict();

const invalidateDeliverySchema = deliveryIdentitySchema.extend({
  invalidate_confirmation: z.literal("yes")
}).strict();

type DeliveryIdentity = z.infer<typeof deliveryIdentitySchema>;

function deliveryRedirect(result: string, identity?: Partial<DeliveryIdentity>): never {
  const query = new URLSearchParams({ result });
  if (identity?.story_chapter_id) query.set("chapter", identity.story_chapter_id);
  const fragment = identity?.story_chapter_id ? `#delivery-${identity.story_chapter_id}` : "";
  redirect(`/staff/deliveries?${query.toString()}${fragment}`);
}

async function validateChapterRoom(
  supabase: Awaited<ReturnType<typeof requireStaff>>["supabase"],
  input: DeliveryIdentity
) {
  const [chapterResult, roomResult] = await Promise.all([
    supabase
      .from("story_chapters")
      .select("id,story_room_id,status,storyteller_share_decision")
      .eq("id", input.story_chapter_id)
      .eq("story_room_id", input.story_room_id)
      .maybeSingle(),
    supabase
      .from("story_rooms")
      .select("id")
      .eq("id", input.story_room_id)
      .maybeSingle()
  ]);

  if (chapterResult.error || roomResult.error) {
    console.error("Delivery chapter/room validation failed", {
      storyChapterId: input.story_chapter_id,
      storyRoomId: input.story_room_id,
      chapterCode: chapterResult.error?.code,
      roomCode: roomResult.error?.code
    });
    return null;
  }

  if (!chapterResult.data || !roomResult.data) return null;
  if (chapterResult.data.story_room_id !== roomResult.data.id) return null;

  return chapterResult.data;
}

function payloadSnapshot(delivery: {
  body: string;
  source_map: unknown;
  delivered_assets: unknown;
}) {
  return JSON.stringify({
    body: delivery.body,
    source_map: delivery.source_map,
    delivered_assets: delivery.delivered_assets
  });
}

/**
 * Runs the intentionally expensive, one-time finalization audit. This action
 * downloads every declared asset and hashes its bytes; it must never be called
 * from Checkout, a payment webhook, or a customer-facing request.
 */
export async function finalizeFinishedDelivery(formData: FormData) {
  const { supabase, user } = await requireStaff();
  const parsed = finalizeDeliverySchema.safeParse({
    story_chapter_id: safeString(formData.get("story_chapter_id")),
    story_room_id: safeString(formData.get("story_room_id")),
    audit_confirmation: safeString(formData.get("audit_confirmation"))
  });

  if (!parsed.success) deliveryRedirect("invalid");
  const input = parsed.data;

  const chapter = await validateChapterRoom(supabase, input);
  if (!chapter) deliveryRedirect("mismatch", input);

  const canReleaseFinishedResult =
    chapter.storyteller_share_decision === "family" &&
    ["sponsor_preview", "approved", "delivered"].includes(chapter.status);
  if (!canReleaseFinishedResult) deliveryRedirect("not_released", input);
  const { data: releaseCurrent, error: releaseError } = await supabase.rpc("story_chapter_release_is_current", {
    p_story_chapter_id: input.story_chapter_id
  });
  if (releaseError || releaseCurrent !== true) deliveryRedirect("not_released", input);

  const { data: delivery, error: deliveryError } = await supabase
    .from("story_chapter_deliveries")
    .select(
      "story_chapter_id,body,source_map,delivered_assets,verified_manifest_sha256,verified_at,verified_by_user_id,updated_at"
    )
    .eq("story_chapter_id", input.story_chapter_id)
    .maybeSingle();

  if (deliveryError) {
    console.error("Delivery lookup failed before storage audit", {
      storyChapterId: input.story_chapter_id,
      code: deliveryError.code
    });
    deliveryRedirect("failed", input);
  }
  if (!delivery || delivery.story_chapter_id !== input.story_chapter_id) {
    deliveryRedirect("missing", input);
  }

  const hasAttestationState = Boolean(
    delivery.verified_manifest_sha256 || delivery.verified_at || delivery.verified_by_user_id
  );
  if (hasAttestationState) deliveryRedirect("already_attested", input);
  if (!isFinishedDeliveryReady(delivery)) deliveryRedirect("not_ready", input);

  const beforeAuditSnapshot = payloadSnapshot(delivery);
  const beforeAuditUpdatedAt = delivery.updated_at;
  const admin = createSupabaseAdminClient();
  let verifiedManifestSha256: string | null = null;

  try {
    verifiedManifestSha256 = await auditFinishedDeliveryStorage(
      admin,
      input.story_room_id,
      delivery.delivered_assets
    );
  } catch (error) {
    console.error("Finished-delivery storage audit threw", {
      storyChapterId: input.story_chapter_id,
      error: error instanceof Error ? error.message : "unknown audit error"
    });
    deliveryRedirect("storage_failed", input);
  }

  if (!verifiedManifestSha256) deliveryRedirect("storage_failed", input);

  // The audit can take time. Re-read the row before writing so an editor cannot
  // accidentally attach a digest to a package that changed during the download.
  const { data: currentDelivery, error: currentError } = await supabase
    .from("story_chapter_deliveries")
    .select(
      "story_chapter_id,body,source_map,delivered_assets,verified_manifest_sha256,verified_at,verified_by_user_id,updated_at"
    )
    .eq("story_chapter_id", input.story_chapter_id)
    .maybeSingle();

  if (currentError) {
    console.error("Delivery recheck failed after storage audit", {
      storyChapterId: input.story_chapter_id,
      code: currentError.code
    });
    deliveryRedirect("failed", input);
  }

  const currentDigest = currentDelivery
    ? deliveryManifestDigest(currentDelivery.delivered_assets)
    : null;
  const changedDuringAudit =
    !currentDelivery ||
    currentDelivery.updated_at !== beforeAuditUpdatedAt ||
    payloadSnapshot(currentDelivery) !== beforeAuditSnapshot ||
    currentDigest !== verifiedManifestSha256 ||
    Boolean(
      currentDelivery.verified_manifest_sha256 ||
      currentDelivery.verified_at ||
      currentDelivery.verified_by_user_id
    );

  if (changedDuringAudit) deliveryRedirect("changed", input);

  const verifiedAt = new Date().toISOString();
  const { data: attested, error: updateError } = await supabase
    .from("story_chapter_deliveries")
    .update({
      verified_manifest_sha256: verifiedManifestSha256,
      verified_at: verifiedAt,
      verified_by_user_id: user.id,
      updated_at: verifiedAt
    })
    .eq("story_chapter_id", input.story_chapter_id)
    .eq("updated_at", beforeAuditUpdatedAt)
    .is("verified_manifest_sha256", null)
    .is("verified_at", null)
    .is("verified_by_user_id", null)
    .select("story_chapter_id,verified_manifest_sha256,verified_at,verified_by_user_id")
    .maybeSingle();

  if (updateError) {
    console.error("Delivery attestation write failed", {
      storyChapterId: input.story_chapter_id,
      code: updateError.code
    });
    deliveryRedirect("failed", input);
  }
  if (
    !attested ||
    attested.verified_manifest_sha256 !== verifiedManifestSha256 ||
    attested.verified_at !== verifiedAt ||
    attested.verified_by_user_id !== user.id
  ) {
    deliveryRedirect("changed", input);
  }

  revalidatePath("/staff/deliveries");
  revalidatePath(`/staff/story-rooms/${input.story_room_id}`);
  revalidatePath(`/story-rooms/${input.story_room_id}`);
  deliveryRedirect("verified", input);
}

/** Clears the attestation boundary before a staff member edits a package. */
export async function invalidateFinishedDelivery(formData: FormData) {
  const { supabase } = await requireStaff();
  const parsed = invalidateDeliverySchema.safeParse({
    story_chapter_id: safeString(formData.get("story_chapter_id")),
    story_room_id: safeString(formData.get("story_room_id")),
    invalidate_confirmation: safeString(formData.get("invalidate_confirmation"))
  });

  if (!parsed.success) deliveryRedirect("invalidate_invalid");
  const input = parsed.data;

  const chapter = await validateChapterRoom(supabase, input);
  if (!chapter) deliveryRedirect("mismatch", input);

  const { data: delivery, error: deliveryError } = await supabase
    .from("story_chapter_deliveries")
    .select("story_chapter_id,verified_manifest_sha256,verified_at,verified_by_user_id")
    .eq("story_chapter_id", input.story_chapter_id)
    .maybeSingle();

  if (deliveryError) {
    console.error("Delivery lookup failed before invalidation", {
      storyChapterId: input.story_chapter_id,
      code: deliveryError.code
    });
    deliveryRedirect("invalidate_failed", input);
  }
  if (!delivery) deliveryRedirect("missing", input);

  const hasAttestationState = Boolean(
    delivery.verified_manifest_sha256 || delivery.verified_at || delivery.verified_by_user_id
  );
  if (!hasAttestationState) deliveryRedirect("not_attested", input);

  const invalidatedAt = new Date().toISOString();
  const { data: invalidated, error: invalidationError } = await supabase
    .from("story_chapter_deliveries")
    .update({
      verified_manifest_sha256: null,
      verified_at: null,
      verified_by_user_id: null,
      updated_at: invalidatedAt
    })
    .eq("story_chapter_id", input.story_chapter_id)
    .select("story_chapter_id,verified_manifest_sha256,verified_at,verified_by_user_id")
    .maybeSingle();

  if (invalidationError) {
    console.error("Delivery attestation invalidation failed", {
      storyChapterId: input.story_chapter_id,
      code: invalidationError.code
    });
    deliveryRedirect("invalidate_failed", input);
  }
  if (
    !invalidated ||
    invalidated.verified_manifest_sha256 !== null ||
    invalidated.verified_at !== null ||
    invalidated.verified_by_user_id !== null
  ) {
    deliveryRedirect("invalidate_failed", input);
  }

  revalidatePath("/staff/deliveries");
  revalidatePath(`/staff/story-rooms/${input.story_room_id}`);
  revalidatePath(`/story-rooms/${input.story_room_id}`);
  deliveryRedirect("invalidated", input);
}
