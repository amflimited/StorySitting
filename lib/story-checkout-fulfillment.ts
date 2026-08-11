import type Stripe from "stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  FINISHED_SITTING_PRICE_CENTS,
  isFinishedDeliveryReady,
  STORY_START_PRICE_CENTS
} from "@/lib/story-product";
import { verifyFinishedDeliveryAttestation } from "@/lib/story-delivery";

type StoryStartIntake = {
  id: string;
  buyer_user_id: string | null;
  buyer_name: string;
  buyer_email: string;
  relationship: string;
  storyteller_name: string;
  storyteller_timezone: string | null;
  best_times: string;
  story_seeds: string[];
  personal_introduction: string | null;
  permission_path: string;
  story_room_id: string | null;
};

function stripeId(value: string | { id: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id ?? null;
}

function assertPaidSession(
  session: Stripe.Checkout.Session,
  product: "story_start" | "finished_result",
  expectedAmount: number
) {
  if (session.payment_status !== "paid") {
    throw new Error("Checkout is not paid.");
  }
  if (session.metadata?.product !== product) {
    throw new Error("Checkout product does not match fulfillment.");
  }
  if (session.currency !== "usd" || session.amount_total !== expectedAmount) {
    throw new Error("Checkout amount does not match the product contract.");
  }
}

async function customerAccountForUser(userId: string) {
  const supabase = createSupabaseAdminClient();
  const { data: existing, error: lookupError } = await supabase
    .from("customer_accounts")
    .select("id")
    .eq("owner_user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (lookupError) throw new Error(`Customer account lookup failed: ${lookupError.message}`);
  if (existing) return existing.id as string;

  const { data: created, error: createError } = await supabase
    .from("customer_accounts")
    .insert({ owner_user_id: userId, source: "story_start" })
    .select("id")
    .single();

  if (createError || !created) {
    // A simultaneous login may have created the account between the read and insert.
    const { data: raced } = await supabase
      .from("customer_accounts")
      .select("id")
      .eq("owner_user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (raced) return raced.id as string;
    throw new Error(`Customer account creation failed: ${createError?.message ?? "unknown error"}`);
  }

  return created.id as string;
}

async function ensureStoryRoom(intake: StoryStartIntake) {
  const supabase = createSupabaseAdminClient();
  const accountId = intake.buyer_user_id
    ? await customerAccountForUser(intake.buyer_user_id)
    : null;

  if (intake.story_room_id) {
    if (accountId) {
      const { error } = await supabase
        .from("story_rooms")
        .update({ customer_account_id: accountId })
        .eq("id", intake.story_room_id)
        .is("customer_account_id", null);
      if (error) throw new Error(`Story Room attachment failed: ${error.message}`);
    }
    return intake.story_room_id;
  }

  const { data: existing, error: existingError } = await supabase
    .from("story_rooms")
    .select("id")
    .eq("sponsor_intake_id", intake.id)
    .maybeSingle();
  if (existingError) throw new Error(`Story Room lookup failed: ${existingError.message}`);

  let roomId = existing?.id as string | undefined;

  if (!roomId) {
    const { data: room, error: roomError } = await supabase
      .from("story_rooms")
      .insert({
        sponsor_intake_id: intake.id,
        customer_account_id: accountId,
        title: `${intake.storyteller_name}'s Story Shelf`,
        subject_name: intake.storyteller_name,
        package_tier: "focused",
        production_status: "permission_pending",
        privacy_status: "private",
        onboarding_data: {
          product_version: "sponsored_call_v2",
          relationship: intake.relationship,
          storyteller_timezone: intake.storyteller_timezone,
          best_times: intake.best_times,
          story_seeds: intake.story_seeds,
          personal_introduction: intake.personal_introduction,
          permission_path: intake.permission_path
        }
      })
      .select("id")
      .single();

    if (roomError || !room) {
      if (roomError?.code === "23505") {
        const { data: raced } = await supabase
          .from("story_rooms")
          .select("id")
          .eq("sponsor_intake_id", intake.id)
          .single();
        roomId = raced?.id as string | undefined;
      }
      if (!roomId) throw new Error(`Story Room creation failed: ${roomError?.message ?? "unknown error"}`);
    } else {
      roomId = room.id as string;
    }
  } else if (accountId) {
    const { error } = await supabase
      .from("story_rooms")
      .update({ customer_account_id: accountId })
      .eq("id", roomId)
      .is("customer_account_id", null);
    if (error) throw new Error(`Story Room attachment failed: ${error.message}`);
  }

  if (!roomId) throw new Error("Story Room could not be resolved.");

  if (intake.story_seeds.length > 0) {
    const { error } = await supabase.from("family_questions").upsert(
      intake.story_seeds.map((question, sourceSequence) => ({
        story_room_id: roomId,
        sponsor_intake_id: intake.id,
        source_sequence: sourceSequence,
        submitted_by_user_id: intake.buyer_user_id,
        submitted_by_name: intake.buyer_name,
        question,
        source: "sponsor",
        status: "queued"
      })),
      { onConflict: "sponsor_intake_id,source_sequence", ignoreDuplicates: true }
    );
    if (error) throw new Error(`Story seed creation failed: ${error.message}`);
  }

  const { error: intakeUpdateError } = await supabase
    .from("sponsor_intakes")
    .update({ story_room_id: roomId, updated_at: new Date().toISOString() })
    .eq("id", intake.id);
  if (intakeUpdateError) throw new Error(`Story intake linking failed: ${intakeUpdateError.message}`);

  return roomId;
}

async function ensurePermissionRequest(intake: StoryStartIntake, roomId: string) {
  const supabase = createSupabaseAdminClient();
  const { data: existing, error: lookupError } = await supabase
    .from("storyteller_permission_requests")
    .select("id,public_token,family_code,status,expires_at")
    .eq("sponsor_intake_id", intake.id)
    .maybeSingle();
  if (lookupError) throw new Error(`Permission request lookup failed: ${lookupError.message}`);
  if (existing) return existing;

  const { data: created, error: createError } = await supabase
    .from("storyteller_permission_requests")
    .insert({
      sponsor_intake_id: intake.id,
      story_room_id: roomId,
      permission_path: intake.permission_path,
      status: "pending"
    })
    .select("id,public_token,family_code,status,expires_at")
    .single();
  if (createError || !created) {
    if (createError?.code === "23505") {
      const { data: raced } = await supabase
        .from("storyteller_permission_requests")
        .select("id,public_token,family_code,status,expires_at")
        .eq("sponsor_intake_id", intake.id)
        .single();
      if (raced) return raced;
    }
    throw new Error(`Permission request creation failed: ${createError?.message ?? "unknown error"}`);
  }
  return created;
}

export async function fulfillStoryStartCheckout(
  session: Stripe.Checkout.Session,
  stripe?: Stripe
) {
  assertPaidSession(session, "story_start", STORY_START_PRICE_CENTS);
  const intakeId = session.metadata?.sponsor_intake_id;
  if (!intakeId) throw new Error("Story Start checkout is missing its intake.");

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("sponsor_intakes")
    .select("id,buyer_user_id,buyer_name,buyer_email,relationship,storyteller_name,storyteller_timezone,best_times,story_seeds,personal_introduction,permission_path,story_room_id")
    .eq("id", intakeId)
    .single();
  if (error || !data) throw new Error(`Story Start intake lookup failed: ${error?.message ?? "not found"}`);

  const intake = data as StoryStartIntake;
  const paymentIntentId = stripeId(session.payment_intent);
  const { data: paymentClaim, error: paymentClaimError } = await supabase.rpc("claim_story_start_payment", {
    p_sponsor_intake_id: intakeId,
    p_stripe_checkout_session_id: session.id,
    p_stripe_payment_intent_id: paymentIntentId,
    p_amount_cents: session.amount_total,
    p_currency: session.currency
  });
  if (paymentClaimError) throw new Error(`Story Start payment claim failed: ${paymentClaimError.message}`);
  if (paymentClaim !== "paid") throw new Error("This Story Start payment is no longer active.");

  let paymentMethodId: string | null = null;
  if (stripe && paymentIntentId) {
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    paymentMethodId = stripeId(intent.payment_method);
  }

  const roomId = await ensureStoryRoom(intake);
  const permissionRequest = await ensurePermissionRequest(intake, roomId);
  const now = new Date().toISOString();
  const { error: intakeError } = await supabase
    .from("sponsor_intakes")
    .update({
      stripe_customer_id: stripeId(session.customer),
      stripe_payment_method_id: paymentMethodId,
      story_room_id: roomId,
      updated_at: now
    })
    .eq("id", intakeId);
  if (intakeError) throw new Error(`Story Start update failed: ${intakeError.message}`);

  const { error: stageError } = await supabase
    .from("sponsor_intakes")
    .update({ status: "permission_pending", updated_at: now })
    .eq("id", intakeId)
    .in("status", ["awaiting_checkout", "start_paid"]);
  if (stageError) throw new Error(`Story Start stage update failed: ${stageError.message}`);

  const { error: orderError } = await supabase
    .from("orders")
    .update({ story_room_id: roomId })
    .eq("sponsor_intake_id", intakeId)
    .eq("order_type", "story_start")
    .eq("status", "paid");
  if (orderError) throw new Error(`Story Start order attachment failed: ${orderError.message}`);

  // A refund/dispute can arrive while room provisioning is in flight. Reclaim
  // the payment lock after provisioning so a revocation closes anything that
  // was created during that narrow window.
  const { data: finalPaymentClaim, error: finalPaymentClaimError } = await supabase.rpc("claim_story_start_payment", {
    p_sponsor_intake_id: intakeId,
    p_stripe_checkout_session_id: session.id,
    p_stripe_payment_intent_id: paymentIntentId,
    p_amount_cents: session.amount_total,
    p_currency: session.currency
  });
  if (finalPaymentClaimError) throw new Error(`Story Start final payment check failed: ${finalPaymentClaimError.message}`);
  if (finalPaymentClaim !== "paid") throw new Error("This Story Start payment was revoked during setup.");

  return {
    intakeId,
    roomId,
    permissionRequest,
    permissionPath: intake.permission_path,
    storytellerName: intake.storyteller_name,
    buyerEmail: intake.buyer_email
  };
}

export async function attachPaidStoryStartsToUser(userId: string, email: string) {
  const supabase = createSupabaseAdminClient();
  const normalizedEmail = email.trim().toLowerCase();
  const { error: attachError } = await supabase
    .from("sponsor_intakes")
    .update({ buyer_user_id: userId, updated_at: new Date().toISOString() })
    .eq("buyer_email", normalizedEmail)
    .is("buyer_user_id", null)
    .in("status", [
      "start_paid",
      "permission_pending",
      "permission_granted",
      "permission_declined",
      "interview_scheduled",
      "interview_complete",
      "story_in_production",
      "story_ready"
    ]);
  if (attachError) throw new Error(`Paid Story Start attachment failed: ${attachError.message}`);

  const { data: intakes, error: intakeError } = await supabase
    .from("sponsor_intakes")
    .select("id,buyer_user_id,buyer_name,buyer_email,relationship,storyteller_name,storyteller_timezone,best_times,story_seeds,personal_introduction,permission_path,story_room_id")
    .eq("buyer_user_id", userId)
    .in("status", [
      "start_paid",
      "permission_pending",
      "permission_granted",
      "permission_declined",
      "interview_scheduled",
      "interview_complete",
      "story_in_production",
      "story_ready"
    ]);
  if (intakeError) throw new Error(`Paid Story Start lookup failed: ${intakeError.message}`);

  const { data: closedCandidates, error: closedError } = await supabase
    .from("sponsor_intakes")
    .select("id")
    .eq("buyer_email", normalizedEmail)
    .eq("status", "closed")
    .is("buyer_user_id", null);
  if (closedError) throw new Error(`Closed Story Start lookup failed: ${closedError.message}`);
  for (const candidate of closedCandidates ?? []) {
    const { data: paidOrder } = await supabase
      .from("orders")
      .select("id")
      .eq("sponsor_intake_id", candidate.id)
      .eq("order_type", "story_start")
      .eq("status", "paid")
      .maybeSingle();
    if (paidOrder) {
      const { error } = await supabase
        .from("sponsor_intakes")
        .update({ buyer_user_id: userId, updated_at: new Date().toISOString() })
        .eq("id", candidate.id)
        .is("buyer_user_id", null);
      if (error) throw new Error(`Closed Story Start attachment failed: ${error.message}`);
      const { data: closedIntake, error: closedIntakeError } = await supabase
        .from("sponsor_intakes")
        .select("id,buyer_user_id,buyer_name,buyer_email,relationship,storyteller_name,storyteller_timezone,best_times,story_seeds,personal_introduction,permission_path,story_room_id")
        .eq("id", candidate.id)
        .single();
      if (closedIntakeError || !closedIntake) {
        throw new Error(`Closed Story Start could not be attached: ${closedIntakeError?.message ?? "not found"}`);
      }
      const roomId = await ensureStoryRoom(closedIntake as StoryStartIntake);
      const { error: closedOrderError } = await supabase
        .from("orders")
        .update({ story_room_id: roomId })
        .eq("sponsor_intake_id", candidate.id)
        .is("story_room_id", null);
      if (closedOrderError) throw new Error(`Closed Story Start order attachment failed: ${closedOrderError.message}`);
    }
  }

  for (const intake of (intakes ?? []) as StoryStartIntake[]) {
    const roomId = await ensureStoryRoom(intake);
    const { error: orderError } = await supabase
      .from("orders")
      .update({ story_room_id: roomId })
      .eq("sponsor_intake_id", intake.id)
      .is("story_room_id", null);
    if (orderError) throw new Error(`Story Start order attachment failed: ${orderError.message}`);
  }
}

export async function fulfillFinishedResultCheckout(
  session: Stripe.Checkout.Session,
  stripe?: Stripe
) {
  assertPaidSession(session, "finished_result", FINISHED_SITTING_PRICE_CENTS);
  const chapterId = session.metadata?.story_chapter_id;
  const storyRoomId = session.metadata?.story_room_id;
  const attemptId = session.metadata?.checkout_attempt_id;
  if (!chapterId || !storyRoomId || !attemptId) {
    throw new Error("Finished result checkout is missing its immutable purchase attempt.");
  }

  const supabase = createSupabaseAdminClient();
  const { data: chapter, error: chapterError } = await supabase
    .from("story_chapters")
    .select("id,story_room_id,status,storyteller_share_decision")
    .eq("id", chapterId)
    .eq("story_room_id", storyRoomId)
    .single();
  if (chapterError || !chapter) throw new Error(`Finished chapter lookup failed: ${chapterError?.message ?? "not found"}`);

  const canDeliver =
    chapter.storyteller_share_decision === "family" &&
    ["sponsor_preview", "approved", "delivered"].includes(chapter.status);
  const { data: releaseCurrent, error: releaseError } = await supabase.rpc("story_chapter_release_is_current", {
    p_story_chapter_id: chapterId
  });
  if (releaseError) throw new Error(`Storyteller release check failed: ${releaseError.message}`);
  const paymentIntentId = stripeId(session.payment_intent);
  const { data: delivery, error: deliveryLookupError } = await supabase
    .from("story_chapter_deliveries")
    .select("body,source_map,delivered_assets,verified_manifest_sha256,verified_at")
    .eq("story_chapter_id", chapterId)
    .maybeSingle();
  if (deliveryLookupError) {
    throw new Error(`Finished result payload lookup failed: ${deliveryLookupError.message}`);
  }
  const resultReady = Boolean(canDeliver && releaseCurrent === true && delivery && isFinishedDeliveryReady(delivery));
  const storageReady = delivery ? verifyFinishedDeliveryAttestation(storyRoomId, delivery) : false;
  const { data: claim, error: claimError } = await supabase.rpc("claim_finished_result_payment", {
    p_attempt_id: attemptId,
    p_stripe_checkout_session_id: session.id,
    p_stripe_payment_intent_id: paymentIntentId,
    p_amount_cents: session.amount_total,
    p_currency: session.currency,
    p_delivery_ready: resultReady && storageReady
  });
  if (claimError) throw new Error(`Finished result payment claim failed: ${claimError.message}`);

  if (claim !== "delivered") {
    if (!stripe || !paymentIntentId) {
      throw new Error("Incomplete result was paid but cannot be refunded automatically.");
    }
    await stripe.refunds.create(
      {
        payment_intent: paymentIntentId,
        reason: "requested_by_customer",
        metadata: { product: "finished_result", story_chapter_id: chapterId, reason: "payment_not_entitled" }
      },
      { idempotencyKey: `finished-result-refund:${session.id}` }
    );
    const { error: refundUpdateError } = await supabase
      .from("result_checkout_attempts")
      .update({ status: "refunded", active: false, updated_at: new Date().toISOString() })
      .eq("id", attemptId)
      .eq("stripe_checkout_session_id", session.id);
    if (refundUpdateError) throw new Error(`Refund record update failed: ${refundUpdateError.message}`);
    return { chapterId, roomId: storyRoomId, delivered: false as const, refunded: true as const };
  }

  const deliveredAt = new Date().toISOString();
  const { error: deliveryError } = await supabase
    .from("story_chapters")
    .update({ status: "delivered", delivered_at: deliveredAt, updated_at: deliveredAt })
    .eq("id", chapterId);
  if (deliveryError) throw new Error(`Finished result delivery failed: ${deliveryError.message}`);

  // The Story Room is the customer-facing source of truth. Advancing only the
  // chapter leaves the dashboard claiming a preview still needs a $79 decision
  // after that decision has already been paid and fulfilled.
  const { error: roomDeliveryError } = await supabase
    .from("story_rooms")
    .update({ production_status: "delivered" })
    .eq("id", storyRoomId);
  if (roomDeliveryError) throw new Error(`Story Room delivery status failed: ${roomDeliveryError.message}`);

  return { chapterId, roomId: storyRoomId, delivered: true as const, refunded: false as const };
}
