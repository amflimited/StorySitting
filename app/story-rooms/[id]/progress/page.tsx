import Link from "next/link";
import { requireUser } from "@/lib/auth";
import {
  sponsorActionForStatus,
  sponsorStageForStatus,
  sponsorStatusFromEvidence
} from "@/lib/story-product";
import { SponsorTimeline } from "@/components/SponsorTimeline";
import { SponsorNextAction } from "@/components/SponsorNextAction";
import { StoryOfferLedger } from "@/components/StoryOfferLedger";

function actionAnchor(status?: string | null) {
  const kind = sponsorActionForStatus(status).kind;
  if (kind === "send_pass") return "#permission-handoff";
  if (kind === "question") return "#question-queue";
  if (kind === "preview") return "#private-preview";
  if (kind === "result") return "#finished-result";
  return "";
}

export default async function FamilyProgressPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireUser();

  const { data: room } = await supabase
    .from("story_rooms")
    .select("id,title,subject_name,production_status,created_at")
    .eq("id", id)
    .single();

  if (!room) {
    return <main className="shell"><section className="card"><h1>Story not found</h1><p>This project may have moved or your account may not have access.</p><Link className="btn" href="/dashboard">Back to the Story Shelf</Link></section></main>;
  }

  const [chapterResult, questionResult, contributionResult, consentResult] = await Promise.all([
    supabase.from("story_chapters").select("status,created_at").eq("story_room_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("family_questions").select("id", { count: "exact", head: true }).eq("story_room_id", id),
    supabase.from("contributions").select("id", { count: "exact", head: true }).eq("story_room_id", id),
    supabase.from("consent_events").select("consent_scope").eq("story_room_id", id).eq("verification_status", "verified").eq("decision", "granted")
  ]);

  const effectiveStatus = sponsorStatusFromEvidence(room.production_status, {
    chapterStatus: chapterResult.data?.status
  });
  const stage = sponsorStageForStatus(effectiveStatus);
  const subject = room.subject_name || "your storyteller";
  const repeatHref = `/start?returning=${encodeURIComponent(subject)}`;

  return (
    <main className="shell family-progress-page">
      <div className="story-detail-nav"><Link href={`/story-rooms/${id}`}>← Full story room</Link><span>Plain-language progress</span></div>

      <header className="progress-ledger-head">
        <div>
          <p className="kicker">{subject} · current record</p>
          <h1>{stage.label}</h1>
          <p>{stage.description}</p>
        </div>
        <dl>
          <div><dt>Verified permission choices</dt><dd>{new Set((consentResult.data ?? []).map((event) => event.consent_scope)).size}</dd></div>
          <div><dt>Family questions</dt><dd>{questionResult.count ?? 0}</dd></div>
          <div><dt>Source contributions</dt><dd>{contributionResult.count ?? 0}</dd></div>
        </dl>
      </header>

      <SponsorNextAction
        status={effectiveStatus}
        subject={subject}
        href={`/story-rooms/${id}${actionAnchor(effectiveStatus)}`}
        cta={stage.id === "shelf" ? "Open the kept result" : "Open this story"}
      />

      <section className="progress-path-panel">
        <SponsorTimeline status={effectiveStatus} heading="Every step, including the money" />
      </section>

      <section className="progress-price-boundary">
        <div><p className="kicker">What each decision means</p><h2>A preview is proof. A kept result is ownership.</h2><p>The private preview includes a meaningful, representative passage. The optional $79 purchase is for the complete source package, permanence, portability, and one correction pass—not for access to the emotional payoff.</p></div>
        <StoryOfferLedger />
      </section>

      {stage.id === "shelf" ? (
        <section className="progress-repeat-action">
          <div><p className="kicker">Continue only when your family asks</p><h2>Another sitting is a new decision.</h2><p>It starts with another $5 Story Start and fresh storyteller permission. Nothing calls or charges itself.</p></div>
          <Link className="btn" href={repeatHref}>Start another sitting with {subject} · $5</Link>
        </section>
      ) : null}
    </main>
  );
}
