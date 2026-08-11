import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  fulfillFinishedResultCheckout,
  fulfillStoryStartCheckout
} from "@/lib/story-checkout-fulfillment";

export const runtime = "nodejs";

function eventAmounts(object: Stripe.Event.Data.Object) {
  const record = object as unknown as Record<string, unknown>;
  const amount =
    typeof record.amount_total === "number"
      ? record.amount_total
      : typeof record.amount === "number"
        ? record.amount
        : null;
  return {
    amount,
    currency: typeof record.currency === "string" ? record.currency : "usd"
  };
}

export async function POST(request: Request) {
  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");

  if (!stripeSecret || !webhookSecret || !signature) {
    return NextResponse.json({ error: "Webhook is not configured." }, { status: 503 });
  }

  const rawBody = await request.text();
  const stripe = new Stripe(stripeSecret);

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  const object = event.data.object;
  const metadata = "metadata" in object ? object.metadata : null;
  const intakeId = metadata?.sponsor_intake_id || null;
  const amounts = eventAmounts(object);

  const { data: claim, error: claimError } = await supabase.rpc("claim_payment_event", {
    p_provider: "stripe",
    p_provider_event_id: event.id,
    p_event_type: event.type,
    p_sponsor_intake_id: intakeId,
    p_amount_cents: amounts.amount,
    p_currency: amounts.currency,
    p_payload: event
  });
  if (claimError) {
    return NextResponse.json({ error: "Event could not be recorded." }, { status: 500 });
  }
  if (claim === "processed" || claim === "processing") return new NextResponse(null, { status: 204 });
  if (claim !== "claimed") {
    return NextResponse.json({ error: "Event could not be claimed." }, { status: 500 });
  }

  try {
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status === "paid") {
        if (session.metadata?.product === "story_start") {
          await fulfillStoryStartCheckout(session, stripe);
        } else if (session.metadata?.product === "finished_result") {
          await fulfillFinishedResultCheckout(session, stripe);
        }
      }
    }

    if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.metadata?.product === "story_start" && session.metadata.sponsor_intake_id) {
        const { error } = await supabase
          .from("sponsor_intakes")
          .update({ status: "closed", updated_at: new Date().toISOString() })
          .eq("id", session.metadata.sponsor_intake_id)
          .eq("status", "awaiting_checkout");
        if (error) throw new Error(error.message);
      }
      if (session.metadata?.product === "finished_result") {
        const { error } = await supabase
          .from("result_checkout_attempts")
          .update({ status: "expired", active: false, updated_at: new Date().toISOString() })
          .eq("stripe_checkout_session_id", session.id)
          .in("status", ["creating", "open"]);
        if (error) throw new Error(error.message);
      }
    }

    if (event.type === "charge.refunded" || event.type === "charge.dispute.created") {
      const charge = event.data.object as Stripe.Charge;
      const paymentIntentId = typeof charge.payment_intent === "string"
        ? charge.payment_intent
        : charge.payment_intent?.id;
      if (paymentIntentId) {
        const status = event.type === "charge.refunded" ? "refunded" : "disputed";
        const { error: revocationError } = await supabase.rpc("revoke_stripe_payment", {
          p_stripe_payment_intent_id: paymentIntentId,
          p_provider_event_id: event.id,
          p_status: status
        });
        if (revocationError) throw new Error(revocationError.message);
      }
    }

    const { error: processedError } = await supabase
      .from("payment_events")
      .update({
        processing_status: "processed",
        processing_started_at: null,
        processed_at: new Date().toISOString(),
        last_error: null
      })
      .eq("provider", "stripe")
      .eq("provider_event_id", event.id)
      .eq("processing_status", "processing");
    if (processedError) throw new Error(processedError.message);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown fulfillment error";
    await supabase
      .from("payment_events")
      .update({ processing_status: "failed", processing_started_at: null, last_error: message.slice(0, 1000) })
      .eq("provider", "stripe")
      .eq("provider_event_id", event.id);
    return NextResponse.json({ error: "Fulfillment will be retried." }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
