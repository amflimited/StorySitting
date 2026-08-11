"use server";

import Stripe from "stripe";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fulfillFinishedResultCheckout } from "@/lib/story-checkout-fulfillment";
import { absoluteUrl, safeString } from "@/lib/utils";
import {
  isFinishedDeliveryReady,
  resultOffer,
  resultOfferIds,
  resultUpgradeAmountCents,
  type ResultOfferId
} from "@/lib/story-product";
import { verifyFinishedDeliveryAttestation } from "@/lib/story-delivery";

export async function purchaseFinishedResult(formData: FormData) {
  const storyRoomId = safeString(formData.get("story_room_id"));
  const chapterId = safeString(formData.get("story_chapter_id"));
  const requestedOffer = safeString(formData.get("offer_id"));
  if (!resultOfferIds.includes(requestedOffer as ResultOfferId)) throw new Error("Choose a valid result edition.");
  const offerId = requestedOffer as ResultOfferId;
  const offer = resultOffer(offerId);
  if (!offer) throw new Error("Choose a valid result edition.");
  const { supabase, user } = await requireUser();

  const { data: chapter, error: chapterError } = await supabase
    .from("story_chapters")
    .select("id,story_room_id,title,status,storyteller_share_decision")
    .eq("id", chapterId)
    .eq("story_room_id", storyRoomId)
    .single();
  if (chapterError || !chapter) throw new Error("This finished preview is not available to your account.");
  if (
    chapter.storyteller_share_decision !== "family" ||
    !["sponsor_preview", "approved", "delivered"].includes(chapter.status)
  ) {
    throw new Error("The storyteller has not released this result for family delivery.");
  }

  const admin = createSupabaseAdminClient();
  const { data: releaseCurrent, error: releaseError } = await admin.rpc("story_chapter_release_is_current", {
    p_story_chapter_id: chapterId
  });
  if (releaseError || releaseCurrent !== true) {
    throw new Error("The storyteller's current release must be verified before checkout can begin.");
  }
  const { data: delivery, error: deliveryError } = await admin
    .from("story_chapter_deliveries")
    .select("body,source_map,delivered_assets,verified_manifest_sha256,verified_at")
    .eq("story_chapter_id", chapterId)
    .maybeSingle();
  const storageReady = delivery ? verifyFinishedDeliveryAttestation(storyRoomId, delivery) : false;
  if (deliveryError || !delivery || !isFinishedDeliveryReady(delivery) || !storageReady) {
    throw new Error("The complete result is still in quality review. No payment was started.");
  }
  const deliveredAssets = delivery.delivered_assets as { heirloomPdf?: unknown } | null;
  if (offerId === "heirloom" && !deliveredAssets?.heirloomPdf) {
    throw new Error("The Heirloom Edition layout is still in quality review. No payment was started.");
  }

  const { data: intake } = await admin
    .from("sponsor_intakes")
    .select("id,stripe_customer_id")
    .eq("story_room_id", storyRoomId)
    .eq("buyer_user_id", user.id)
    .maybeSingle();

  const orderLookup = await admin
    .from("orders")
    .select("id,status,stripe_checkout_session_id,result_offer_id,result_paid_total_cents")
    .eq("story_chapter_id", chapterId)
    .eq("order_type", "finished_result")
    .maybeSingle();
  let order = orderLookup.data;
  const orderLookupError = orderLookup.error;
  if (orderLookupError) throw new Error(`Result order could not be read: ${orderLookupError.message}`);
  if (!order) {
    const { data: created, error: createError } = await admin
      .from("orders")
      .insert({
        story_room_id: storyRoomId,
        story_chapter_id: chapterId,
        sponsor_intake_id: intake?.id ?? null,
        order_type: "finished_result",
        amount_cents: 0,
        currency: "usd",
        status: "checkout_pending"
      })
      .select("id,status,stripe_checkout_session_id,result_offer_id,result_paid_total_cents")
      .single();
    if (createError || !created) {
      const { data: raced } = await admin
        .from("orders")
        .select("id,status,stripe_checkout_session_id,result_offer_id,result_paid_total_cents")
        .eq("story_chapter_id", chapterId)
        .eq("order_type", "finished_result")
        .single();
      order = raced;
    } else {
      order = created;
    }
  }
  if (!order) throw new Error("Result order could not be created.");
  const paidTotalCents = Number(order.result_paid_total_cents ?? 0);
  const amountDueCents = resultUpgradeAmountCents(offerId, paidTotalCents);
  if (amountDueCents <= 0) redirect(`/story-rooms/${storyRoomId}`);

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecret) throw new Error("Result checkout is being connected. Please try again shortly.");
  const stripe = new Stripe(stripeSecret);

  const attemptLookup = await admin
    .from("result_checkout_attempts")
    .select("id,stripe_checkout_session_id,status,offer_id,from_paid_cents,amount_cents")
    .eq("story_chapter_id", chapterId)
    .eq("active", true)
    .maybeSingle();
  let attempt = attemptLookup.data;
  const attemptLookupError = attemptLookup.error;
  if (attemptLookupError) throw new Error(`Checkout attempt could not be read: ${attemptLookupError.message}`);

  if (attempt?.stripe_checkout_session_id) {
    const priorSession = await stripe.checkout.sessions.retrieve(attempt.stripe_checkout_session_id);
    if (priorSession.status === "open" && priorSession.url && attempt.offer_id === offerId && Number(attempt.from_paid_cents) === paidTotalCents) redirect(priorSession.url);
    if (priorSession.payment_status === "paid") {
      await fulfillFinishedResultCheckout(priorSession, stripe);
      redirect(`/story-rooms/${storyRoomId}`);
    }
    if (priorSession.status === "open") {
      await stripe.checkout.sessions.expire(priorSession.id);
    }
    await admin
      .from("result_checkout_attempts")
      .update({ status: "expired", active: false, updated_at: new Date().toISOString() })
      .eq("id", attempt.id);
    attempt = null;
  }

  if (!attempt) {
    const { data: createdAttempt, error: createAttemptError } = await admin
      .from("result_checkout_attempts")
      .insert({
        order_id: order.id,
        story_chapter_id: chapterId,
        offer_id: offerId,
        from_paid_cents: paidTotalCents,
        amount_cents: amountDueCents,
        status: "creating",
        active: true
      })
      .select("id,stripe_checkout_session_id,status,offer_id,from_paid_cents,amount_cents")
      .single();
    if (createAttemptError || !createdAttempt) {
      const { data: racedAttempt } = await admin
        .from("result_checkout_attempts")
        .select("id,stripe_checkout_session_id,status,offer_id,from_paid_cents,amount_cents")
        .eq("story_chapter_id", chapterId)
        .eq("active", true)
        .single();
      attempt = racedAttempt;
    } else {
      attempt = createdAttempt;
    }
  }
  if (!attempt) throw new Error("A result checkout could not be reserved.");

  const metadata: Stripe.MetadataParam = {
    product: "finished_result",
    result_offer_id: offerId,
    amount_cents: String(amountDueCents),
    from_paid_cents: String(paidTotalCents),
    story_room_id: storyRoomId,
    story_chapter_id: chapterId,
    checkout_attempt_id: attempt.id
  };
  if (intake?.id) metadata.sponsor_intake_id = intake.id;

  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      payment_method_types: ["card"],
      ...(intake?.stripe_customer_id
        ? { customer: intake.stripe_customer_id }
        : { customer_email: user.email ?? undefined }),
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: amountDueCents,
          product_data: {
            name: `${offer.name} · “${chapter.title}”`,
            description: offer.description
          }
        }
      }],
      metadata,
      payment_intent_data: {
        metadata
      },
      custom_text: {
        submit: { message: `You already saw the private preview. This one-time ${offer.name} purchase does not start a subscription or another call.` }
      },
      success_url: absoluteUrl("/result/success?session_id={CHECKOUT_SESSION_ID}"),
      cancel_url: absoluteUrl(`/story-rooms/${storyRoomId}?result=not-kept`)
    },
    { idempotencyKey: `finished-result-attempt:${attempt.id}` }
  );

  const { error: attemptUpdateError } = await admin
    .from("result_checkout_attempts")
    .update({ stripe_checkout_session_id: session.id, status: "open", updated_at: new Date().toISOString() })
    .eq("id", attempt.id);
  if (attemptUpdateError) throw new Error(`Result checkout could not be recorded: ${attemptUpdateError.message}`);
  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  redirect(session.url);
}
