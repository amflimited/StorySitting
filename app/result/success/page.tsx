import Link from "next/link";
import Stripe from "stripe";
import { fulfillFinishedResultCheckout } from "@/lib/story-checkout-fulfillment";
import { SponsorTimeline } from "@/components/SponsorTimeline";

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
  return (
    <main className="journey-success-page result-kept-success">
      <header className="success-receipt">
        <div className="success-seal">✓</div>
        <div><span className="overline"><i /> Receipt confirmed · $79 once</span><h1>This is now a kept result.</h1><p>The private preview did its job. Your one-time purchase unlocks the complete family package; it did not begin a subscription or another call.</p></div>
      </header>
      <section className="kept-package-list">
        <div><span>01</span><strong>Complete recording</strong><p>The source voice, not a synthetic recreation.</p></div>
        <div><span>02</span><strong>Full transcript</strong><p>A portable record you can search and keep.</p></div>
        <div><span>03</span><strong>Source-linked chapter</strong><p>Edited prose stays traceable to the words that support it.</p></div>
        <div><span>04</span><strong>One correction pass</strong><p>Bundle any factual, name, date, privacy, or tone changes.</p></div>
      </section>
      <SponsorTimeline status="delivered" heading="This sitting is complete" />
      <section className="success-shelf-action">
        <div><span>Your next action</span><h2>Download it. Read it. Ask what comes next.</h2><p>The Story Room now holds the full package and question queue. Another sitting happens only through a new $5 Story Start and fresh permission.</p></div>
        <div className="success-action-buttons"><Link className="button button-primary" href={`/story-rooms/${result.roomId}#finished-result`}>Open the kept result</Link><Link className="button button-secondary" href="/dashboard">Return to Story Shelf</Link></div>
      </section>
    </main>
  );
}
