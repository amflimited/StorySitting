import { NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import Stripe from "stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizeUsPhone } from "@/lib/phone";
import { sponsoredStoryIntakeSchema, STORY_START_PRICE_CENTS } from "@/lib/story-product";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const IDEMPOTENCY_PATTERN = /^[a-zA-Z0-9_-]{16,80}$/;

function fingerprint(secret: string, value: string) {
  return createHmac("sha256", secret).update(value).digest("hex");
}

function publicAppUrl(request: Request) {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    new URL(request.url).origin
  );
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "The request could not be read." }, { status: 400 });
  }

  const parsed = sponsoredStoryIntakeSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please check the highlighted details and try again." },
      { status: 400 }
    );
  }

  if (parsed.data.website) {
    return NextResponse.json({ error: "The request could not be submitted." }, { status: 400 });
  }
  if (parsed.data.permission_path !== "family_pass") {
    return NextResponse.json(
      { error: "Family Pass is the permission path available for new Story Starts right now." },
      { status: 400 }
    );
  }

  const storytellerPhone = normalizeUsPhone(parsed.data.storyteller_phone);
  if (!storytellerPhone) {
    return NextResponse.json({ error: "Enter a valid phone number." }, { status: 400 });
  }

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  const evidenceSecret = process.env.CONSENT_EVIDENCE_SECRET;
  if (!stripeSecret || !evidenceSecret || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Checkout is being connected. Please try again shortly." },
      { status: 503 }
    );
  }

  const supabase = createSupabaseAdminClient();
  const stripe = new Stripe(stripeSecret);
  const appUrl = publicAppUrl(request);
  const sessionClient = await createSupabaseServerClient();
  const { data: authData } = await sessionClient.auth.getUser();
  const buyerUserId =
    authData.user?.email?.toLowerCase() === parsed.data.buyer_email.toLowerCase()
      ? authData.user.id
      : null;
  const { data: blocked, error: dncError } = await supabase.rpc("is_phone_do_not_call", {
    p_phone: storytellerPhone
  });

  if (dncError) {
    return NextResponse.json(
      { error: "We could not safely verify this number. No payment was taken." },
      { status: 503 }
    );
  }

  if (blocked) {
    return NextResponse.json(
      { error: "StorySitting cannot contact this number. No payment was taken." },
      { status: 409 }
    );
  }

  const idempotencyHeader = request.headers.get("idempotency-key")?.trim() ?? "";
  const idempotencyKey = IDEMPOTENCY_PATTERN.test(idempotencyHeader) ? idempotencyHeader : null;
  if (idempotencyKey) {
    const { data: existing, error: existingError } = await supabase
      .from("sponsor_intakes")
      .select("id,buyer_email,stripe_checkout_session_id")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existingError) {
      return NextResponse.json({ error: "Checkout could not be safely resumed." }, { status: 503 });
    }
    if (existing) {
      if (existing.buyer_email !== parsed.data.buyer_email.toLowerCase() || !existing.stripe_checkout_session_id) {
        return NextResponse.json({ error: "This Story Start request cannot be reused." }, { status: 409 });
      }
      const prior = await stripe.checkout.sessions.retrieve(existing.stripe_checkout_session_id);
      if (prior.status === "open" && prior.url) return NextResponse.json({ url: prior.url });
      if (prior.payment_status === "paid") {
        return NextResponse.json({ url: `${appUrl}/start/success?session_id=${prior.id}` });
      }
      return NextResponse.json(
        { error: "That secure checkout expired. Reload the Story Start to begin a fresh request." },
        { status: 409 }
      );
    }
  }

  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const networkFingerprint = fingerprint(evidenceSecret, forwardedFor);
  const emailFingerprint = fingerprint(evidenceSecret, parsed.data.buyer_email.toLowerCase());
  const { data: requestClaimed, error: throttleError } = await supabase.rpc("claim_story_start_request", {
    p_network_fingerprint: networkFingerprint,
    p_email_fingerprint: emailFingerprint
  });
  if (throttleError) {
    return NextResponse.json({ error: "Checkout cannot be safely started right now." }, { status: 503 });
  }
  if (!requestClaimed) {
    return NextResponse.json(
      { error: "Too many Story Starts were requested. Wait an hour or contact StorySitting." },
      { status: 429 }
    );
  }

  const { data: intake, error: intakeError } = await supabase
    .from("sponsor_intakes")
    .insert({
      buyer_user_id: buyerUserId,
      buyer_name: parsed.data.buyer_name,
      buyer_email: parsed.data.buyer_email.toLowerCase(),
      relationship: parsed.data.relationship,
      storyteller_name: parsed.data.storyteller_name,
      storyteller_phone: storytellerPhone,
      storyteller_timezone: parsed.data.storyteller_timezone || null,
      best_times: parsed.data.best_times,
      story_seeds: parsed.data.story_seeds,
      story_shape: parsed.data.story_shape,
      artifact_note: parsed.data.artifact_note || null,
      family_context: parsed.data.family_context || null,
      personal_introduction: parsed.data.personal_introduction || null,
      permission_path: parsed.data.permission_path,
      idempotency_key: idempotencyKey,
      sponsor_contact_authorized_at: new Date().toISOString(),
      status: "awaiting_checkout"
    })
    .select("id")
    .single();

  if (intakeError || !intake) {
    return NextResponse.json(
      { error: "We could not save the Story Start. No payment was taken." },
      { status: 503 }
    );
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_creation: "always",
      customer_email: parsed.data.buyer_email.toLowerCase(),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: STORY_START_PRICE_CENTS,
            product_data: {
              name: "StorySitting Story Start",
              description: "Trusted permission setup for one family storyteller"
            }
          }
        }
      ],
      payment_intent_data: {
        metadata: { sponsor_intake_id: intake.id, product: "story_start" }
      },
      custom_text: {
        submit: {
          message: "$5 opens the permission process. After a finished preview, Voice is $39, Story is $79, and Heirloom is $149. No subscription."
        }
      },
      metadata: {
        sponsor_intake_id: intake.id,
        product: "story_start"
      },
      success_url: `${appUrl}/start/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/start?cancelled=1`
    }, idempotencyKey ? { idempotencyKey: `story-start:${idempotencyKey}` } : undefined);

    const { error: sessionLinkError } = await supabase
      .from("sponsor_intakes")
      .update({ stripe_checkout_session_id: session.id, updated_at: new Date().toISOString() })
      .eq("id", intake.id);
    if (sessionLinkError) {
      if (session.status === "open") await stripe.checkout.sessions.expire(session.id);
      throw new Error("Checkout session could not be linked to its Story Start.");
    }

    return NextResponse.json({ url: session.url });
  } catch {
    await supabase
      .from("sponsor_intakes")
      .update({ status: "closed", updated_at: new Date().toISOString() })
      .eq("id", intake.id);

    return NextResponse.json(
      { error: "Secure checkout could not be opened. No payment was taken." },
      { status: 502 }
    );
  }
}
