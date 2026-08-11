import Link from "next/link";
import Stripe from "stripe";
import { fulfillFinishedResultCheckout } from "@/lib/story-checkout-fulfillment";
import { SponsorTimeline } from "@/components/SponsorTimeline";
import { resultOffer } from "@/lib/story-product";

export const metadata = { title: "Finished story status", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function confirmFinishedResult(sessionId: string, stripeSecret: string) {
  try {
    const stripe = new Stripe(stripeSecret);
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const result = await fulfillFinishedResultCheckout(session, stripe);
    return { ok: true as const, result };
  } catch {
    return { ok: false as const };
  }
}

export default async function ResultSuccessPage({
  searchParams
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id: sessionId } = await searchParams;
  const stripeSecret = process.env.STRIPE_SECRET_KEY;

  if (!sessionId?.startsWith("cs_") || !stripeSecret) {
    return <main className="journey-success-page"><div className="success-seal">—</div><h1>No paid result can be confirmed here.</h1><p>Return to your Story Shelf or contact us if you expected a receipt.</p><Link className="button button-secondary" href="/dashboard">Open Story Shelf</Link></main>;
  }

  const confirmation = await confirmFinishedResult(sessionId, stripeSecret);
  if (!confirmation.ok) {
    return <main className="journey-success-page"><div className="success-seal">···</div><span className="overline"><i /> Verifying result</span><h1>Stripe is still confirming this payment.</h1><p>We will not claim the story is unlocked until payment and the complete delivery package both pass verification.</p><Link className="button button-secondary" href="/dashboard">Return to Story Shelf</Link></main>;
  }

  const { result } = confirmation;
  if (!result.delivered) {
    return <main className="journey-success-page"><div className="success-seal">↺</div><span className="overline"><i /> Automatic protection</span><h1>The complete result was not ready, so the payment was refunded.</h1><p>Nothing was unlocked or represented as delivered. StorySitting will contact you after reviewing the production record.</p><Link className="button button-secondary" href={`/story-rooms/${result.roomId}`}>Return to this story</Link></main>;
  }
  const offer = resultOffer(result.offerId);
  if (!offer) {
    return <main className="journey-success-page"><div className="success-seal">—</div><h1>The edition receipt needs review.</h1><p>Your payment is recorded, but StorySitting will not describe access until the edition is verified.</p><Link className="button button-secondary" href={`/story-rooms/${result.roomId}`}>Return to this story</Link></main>;
  }
  return (
    <main className="journey-success-page result-kept-success">
      <header className="success-receipt">
        <div className="success-seal">✓</div>
        <div><span className="overline"><i /> Receipt confirmed · ${(result.amountCents / 100).toFixed(0)} once</span><h1>{offer.name} is now kept.</h1><p>The private preview did its job. This one-time payment unlocks the {offer.layer.toLowerCase()} layer; it did not begin a subscription or another call.</p></div>
      </header>
      <section className="kept-package-list">
        {offer.features.map((feature, index) => <div key={feature}><span>{String(index + 1).padStart(2, "0")}</span><strong>{feature}</strong><p>Included in the active {offer.name}.</p></div>)}
      </section>
      <SponsorTimeline status="delivered" heading="This sitting is complete" />
      <section className="success-shelf-action">
        <div><span>Your next action</span><h2>Download it. Live with it. Add a layer only if it earns one.</h2><p>The Story Room now holds the {offer.name}. A larger edition charges only the difference. Another sitting still requires a new $5 Story Start and fresh permission.</p></div>
        <div className="success-action-buttons"><Link className="button button-primary" href={`/story-rooms/${result.roomId}#finished-result`}>Open the kept result</Link><Link className="button button-secondary" href="/dashboard">Return to Story Shelf</Link></div>
      </section>
    </main>
  );
}
