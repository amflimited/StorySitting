import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createInvite } from "./server-actions";
import { absoluteUrl } from "@/lib/utils";
import { calculateStoryReadiness, productionStatusFromReadiness } from "@/lib/story-readiness";
import { WorkflowGuide } from "@/components/WorkflowGuide";

function statusLabel(value: string | null | undefined) {
  return value ? value.replaceAll("_", " ") : "unknown";
}

export default async function StoryRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireUser();

  const { data: room, error } = await supabase
    .from("story_rooms")
    .select("id,title,subject_name,package_tier,production_status,onboarding_data")
    .eq("id", id)
    .single();

  if (error || !room) {
    return <main className="shell"><div className="card">Story Room not found.</div></main>;
  }

  const { data: invites } = await supabase
    .from("invites")
    .select("id,invite_token,email,phone,status,created_at")
    .eq("story_room_id", id)
    .order("created_at", { ascending: false });

  const { data: contributions } = await supabase
    .from("contributions")
    .select("id,title,contribution_type,review_status,submitted_at")
    .eq("story_room_id", id)
    .order("submitted_at", { ascending: false });

  const onboarding = (room.onboarding_data ?? {}) as { why_now?: string; known_materials?: string };
  const readiness = calculateStoryReadiness({
    inviteCount: invites?.length ?? 0,
    contributionCount: contributions?.length ?? 0,
    approvedCount: (contributions ?? []).filter((item) => item.review_status === "approved" || item.review_status === "used_in_memory_card").length,
    contributions: contributions ?? [],
    whyNow: onboarding.why_now,
    knownMaterials: onboarding.known_materials
  });

  return (
    <main className="shell stack">
      <div>
        <p className="kicker">Story Room</p>
        <h1>{room.title}</h1>
        <p>{room.subject_name}</p>
        <span className="badge">{statusLabel(room.production_status)}</span>
      </div>

      <WorkflowGuide
        role="owner"
        status={room.production_status}
        title="Current Capsule phase"
        justHappened="This Story Room is now acting as the active operations center for the Capsule. Contributions, review, interview prep, and production all move through this page."
      />

      <section className="card stack">
        <div className="between">
          <div>
            <p className="kicker">Story readiness</p>
            <h2>{readiness.score}% — {readiness.label}</h2>
            <p>{readiness.summary}</p>
          </div>
          <span className="badge strong">{productionStatusFromReadiness(readiness)}</span>
        </div>
        <div className="progress"><span style={{ width: `${readiness.score}%` }} /></div>
        <div className="metrics-grid">
          <div><strong>{readiness.counts.invites}</strong><span>Invites</span></div>
          <div><strong>{readiness.counts.contributions}</strong><span>Contributions</span></div>
          <div><strong>{readiness.counts.voice}</strong><span>Voice items</span></div>
          <div><strong>{readiness.counts.photo}</strong><span>Photos</span></div>
          <div><strong>{readiness.counts.question}</strong><span>Questions</span></div>
          <div><strong>{readiness.counts.approved}</strong><span>Approved</span></div>
        </div>

        <div className="mini-card">
          <strong>What moves the Capsule forward fastest</strong>
          <p>
            The highest leverage actions are: invite another family member, gather one voice memory, collect one object-based story, and submit questions the family wishes they had asked earlier.
          </p>
        </div>

        {readiness.nextActions.length > 0 && (
          <div>
            <h3>Next best moves</h3>
            <ul className="action-list">
              {readiness.nextActions.map((action) => <li key={action}>{action}</li>)}
            </ul>
          </div>
        )}
      </section>

      <div className="grid">
        <section className="card">
          <h2>Invite contributor</h2>
          <p>
            Every contributor increases the quality of the final Story Capsule. Even one recipe, quote, photo caption, or remembered phrase can change the interview direction.
          </p>
          <form action={createInvite} className="stack">
            <input type="hidden" name="story_room_id" value={id} />
            <label>Name<input name="display_name" /></label>
            <label>Email<input name="email" type="email" /></label>
            <label>Phone<input name="phone" /></label>
            <button type="submit">Create invite link</button>
          </form>
        </section>

        <section className="card">
          <h2>Invite links</h2>
          <div className="stack">
            {(invites ?? []).map((invite) => (
              <div key={invite.id} className="mini-card">
                <p><strong>{invite.email || invite.phone || "Contributor"}</strong> <span className="status">{invite.status}</span></p>
                <code>{absoluteUrl(`/invite/${invite.invite_token}`)}</code>
              </div>
            ))}
            {(!invites || invites.length === 0) && <p>No invites yet.</p>}
          </div>
        </section>
      </div>

      <section className="card">
        <div className="between">
          <div>
            <h2>Recent contributions</h2>
            <p>The Story Room becomes more useful as contributions accumulate into themes and interview prompts.</p>
          </div>
          <Link className="btn secondary" href="/staff">Open staff review</Link>
        </div>

        <table>
          <thead><tr><th>Title</th><th>Type</th><th>Status</th><th>Submitted</th></tr></thead>
          <tbody>
            {(contributions ?? []).map((c) => (
              <tr key={c.id}><td>{c.title || "Untitled"}</td><td>{c.contribution_type}</td><td>{statusLabel(c.review_status)}</td><td>{new Date(c.submitted_at).toLocaleString()}</td></tr>
            ))}
          </tbody>
        </table>
        {(!contributions || contributions.length === 0) && <p>No contributions yet.</p>}
      </section>
    </main>
  );
}
