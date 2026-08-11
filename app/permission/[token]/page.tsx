import type { Metadata } from "next";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { respondToPermission } from "./server-actions";

export const metadata: Metadata = {
  title: "Your Family Pass",
  robots: { index: false, follow: false }
};
export const dynamic = "force-dynamic";
export const revalidate = 0;

type PermissionPageProps = { params: Promise<{ token: string }> };

export default async function PermissionPage({ params }: PermissionPageProps) {
  const { token } = await params;
  const supabase = createSupabaseAdminClient();
  const { data: permission } = await supabase
    .from("storyteller_permission_requests")
    .select("id,sponsor_intake_id,status,permission_path")
    .eq("public_token", token)
    .gt("expires_at", "now")
    .maybeSingle();

  // The database evaluates the special Postgres timestamp value `now`; no
  // bearer-link details are returned after expiration.
  if (!permission || permission.status !== "pending") {
    return (
      <main className="permission-page section-shell">
        <section className="permission-unavailable">
          <span className="permission-shield">—</span>
          <p className="kicker">Private Family Pass</p>
          <h1>This pass is not available.</h1>
          <p>It may have expired or already been answered. Nothing can be recorded or scheduled from this page.</p>
        </section>
      </main>
    );
  }

  const { data: intake } = await supabase
    .from("sponsor_intakes")
    .select("buyer_name,relationship,storyteller_name,personal_introduction")
    .eq("id", permission.sponsor_intake_id)
    .single();

  if (!intake) {
    return <main className="permission-page section-shell"><section className="permission-unavailable"><h1>This pass is not available.</h1></section></main>;
  }

  return (
    <main className="permission-page section-shell">
      <section className="permission-intro">
        <span className="overline"><i /> A private invitation from {intake.buyer_name}</span>
        <h1>{intake.storyteller_name}, this story is your choice.</h1>
        <p>
          {intake.buyer_name}, your {intake.relationship}, opened a StorySitting because they would
          love to preserve a few stories in your own voice. They paid the $5 start. StorySitting
          will never ask you for money.
        </p>
        {intake.personal_introduction && <blockquote>“{intake.personal_introduction}”<small>— {intake.buyer_name}</small></blockquote>}
      </section>

      <div className="permission-layout">
        <aside className="permission-explainer">
          <p className="kicker">Before you decide</p>
          <h2>What “yes” starts</h2>
          <ol>
            <li><span>01</span><p><strong>A human identity check</strong>Your response pauses here until a StorySitter speaks with you, or you call us from your own phone.</p></li>
            <li><span>02</span><p><strong>Then, one AI-assisted sitting</strong>Only after that independent check may an interview be scheduled. The call identifies StorySitting and the AI interviewer.</p></li>
            <li><span>03</span><p><strong>A separate recording yes</strong>Recording stays off unless you clearly agree out loud during the sitting.</p></li>
            <li><span>04</span><p><strong>You still control the result</strong>You may stop, skip anything, correct a fact, keep a chapter private, or revoke future contact.</p></li>
          </ol>
          <div className="permission-safety"><strong>Our permanent safety rule</strong><p>We never ask for money, passwords, account numbers, security answers, or a voice clone.</p></div>
        </aside>

        <form action={respondToPermission} className="permission-form">
          <input type="hidden" name="permission_token" value={token} />
          <div><p className="kicker">Your response</p><h2>No one else can answer this for you.</h2></div>
          <label className="field-label">Your name
            <input name="storyteller_name" defaultValue={intake.storyteller_name} required autoComplete="name" />
          </label>
          <label className="field-label">Four-digit family code
            <input name="family_code" required inputMode="numeric" pattern="[0-9]{4}" maxLength={4} placeholder="0000" autoComplete="one-time-code" />
            <small>Ask {intake.buyer_name} for the code they sent separately. It should match their message.</small>
          </label>
          <label className="permission-check">
            <input type="checkbox" name="adult_confirmation" required />
            <span>I am the adult named in this invitation, and I am making this choice for myself.</span>
          </label>
          <label className="permission-check">
            <input type="checkbox" name="ai_permission" />
            <span>I would like to continue to the independent human identity check for one AI-assisted family-history interview. I understand this form alone does not schedule the AI call, and recording still requires my clear spoken permission.</span>
          </label>
          <div className="permission-actions">
            <button type="submit" name="decision" value="granted" className="button button-primary">Yes, continue to the human check</button>
            <button type="submit" name="decision" value="declined" className="button button-secondary">No, I do not want the call</button>
          </div>
          <label className="permission-check permission-dnc">
            <input type="checkbox" name="do_not_call" />
            <span>If I decline, also put my number on StorySitting&apos;s permanent do-not-call list.</span>
          </label>
          <small className="permission-fineprint">Declining does not charge you or {intake.buyer_name} another fee. No result edition purchase is automatic.</small>
        </form>
      </div>
    </main>
  );
}
