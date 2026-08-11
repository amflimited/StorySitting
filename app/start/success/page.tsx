import type { Metadata } from "next";
import Link from "next/link";
import Stripe from "stripe";
import {
  attachPaidStoryStartsToUser,
  fulfillStoryStartCheckout
} from "@/lib/story-checkout-fulfillment";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { absoluteUrl } from "@/lib/utils";
import { FamilyPassHandoff } from "@/components/FamilyPassHandoff";
import { SponsorTimeline } from "@/components/SponsorTimeline";
import { StoryOfferLedger } from "@/components/StoryOfferLedger";

export const metadata: Metadata = { title: "Your Story Start is open", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export const revalidate = 0;

type SuccessProps = { searchParams: Promise<{ session_id?: string }> };

async function confirmStoryStart(sessionId: string, stripeSecret: string) {
  try {
    const stripe = new Stripe(stripeSecret);
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const result = await fulfillStoryStartCheckout(session, stripe);
    const sessionClient = await createSupabaseServerClient();
    const { data: authData } = await sessionClient.auth.getUser();
    const user = authData.user;
    if (user?.email_confirmed_at && user.email?.toLowerCase() === result.buyerEmail.toLowerCase()) {
      await attachPaidStoryStartsToUser(user.id, user.email);
    }
    return { ok: true as const, result, user };
  } catch {
    return { ok: false as const };
  }
}

export default async function StartSuccessPage({ searchParams }: SuccessProps) {
  const { session_id: sessionId } = await searchParams;
  const stripeSecret = process.env.STRIPE_SECRET_KEY;

  if (!sessionId || !sessionId.startsWith("cs_") || !stripeSecret) {
    return (
      <main className="journey-success-page">
        <div className="success-seal">—</div>
        <span className="overline"><i /> Story Start status</span>
        <h1>We cannot confirm a payment from this page.</h1>
        <p>No receipt is being claimed. Return to the Story Start or contact us if Stripe already charged you.</p>
        <div className="hero-actions" style={{ justifyContent: "center" }}><Link className="button button-primary" href="/start">Return to Story Start</Link></div>
      </main>
    );
  }

  const confirmation = await confirmStoryStart(sessionId, stripeSecret);
  if (!confirmation.ok) {
    return (
      <main className="journey-success-page">
        <div className="success-seal">···</div>
        <span className="overline"><i /> Verifying Story Start</span>
        <h1>Your checkout is still being confirmed.</h1>
        <p>We are not claiming a completed charge until Stripe confirms it. Refreshing this page is safe; after confirmation, your Family Pass also stays available inside your private Story Shelf.</p>
        <div className="hero-actions" style={{ justifyContent: "center" }}><Link className="button button-secondary" href="/start">Return to Story Start</Link><a className="button button-secondary" href="mailto:adam@onesmallprompt.com">Get help</a></div>
      </main>
    );
  }

  const { result, user } = confirmation;
  const familyPass = result.permissionPath === "family_pass" && result.permissionRequest.status === "pending";
  const permissionHref = `/permission/${result.permissionRequest.public_token}`;
  const permissionUrl = absoluteUrl(permissionHref);

  return (
    <main className="journey-success-page paid-start-success">
      <header className="success-receipt">
        <div className="success-seal">✓</div>
        <div>
          <span className="overline"><i /> Receipt confirmed · $5 Story Start</span>
          <h1>The project is open. Their choice comes next.</h1>
          <p>You paid for the beginning—not for {result.storytellerName}&apos;s consent and not for an automatic call. No other charge is scheduled.</p>
        </div>
      </header>

      {familyPass && (
        <FamilyPassHandoff
          storytellerName={result.storytellerName}
          familyCode={result.permissionRequest.family_code}
          permissionHref={permissionHref}
          permissionUrl={permissionUrl}
        />
      )}

      {!familyPass && (
        <section className="success-next-panel">
          <span>StorySitting has the next action</span>
          <h2>{result.permissionRequest.status === "pending" ? "A person is checking the permission setup." : "This permission path already has a recorded answer."}</h2>
          <p>We will email you when the state changes. We do not turn a sponsor payment into storyteller consent.</p>
        </section>
      )}

      <SponsorTimeline status="permission_pending" heading="What happens from here" />
      <StoryOfferLedger compact />

      <section className="success-shelf-action">
        <div>
          <span>Keep the handoff somewhere safe</span>
          <h2>{user ? "Your Story Shelf is ready." : "Create the private shelf for your updates."}</h2>
          <p>Permission, the sitting time, the private preview, and the kept result all return to one trackable place.</p>
        </div>
        <div className="success-action-buttons">
          {user ? <Link className="button button-primary" href="/dashboard">Open your Story Shelf</Link> : <Link className="button button-primary" href="/signup">Create your Story Shelf</Link>}
          {!user && <Link className="button button-secondary" href="/login">I already have an account</Link>}
        </div>
      </section>
    </main>
  );
}
