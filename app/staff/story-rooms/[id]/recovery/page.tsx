import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import {
  buildDeliveryChecklist,
  buildNextMove,
  buildPostflightQuestions,
  buildReusableAssets,
  buildSignals,
  calculateReusabilityScore
} from "@/lib/capsule-recovery";

export default async function OperatorRecoveryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireStaff();

  const { data: room } = await supabase
    .from("story_rooms")
    .select("id,title,subject_name,production_status")
    .eq("id", id)
    .single();

  const { data: contributions } = await supabase
    .from("contributions")
    .select("id,review_status,contribution_type")
    .eq("story_room_id", id);

  const { data: memoryCards } = await supabase
    .from("memory_cards")
    .select("id,status,quote")
    .eq("story_room_id", id);

  const { data: storyMaps } = await supabase
    .from("story_maps")
    .select("id,status")
    .eq("story_room_id", id);

  const { data: capsules } = await supabase
    .from("story_capsules")
    .select("id,status,web_slug,delivered_at,capsule_data")
    .eq("story_room_id", id)
    .order("created_at", { ascending: false });

  if (!room) {
    return <main className="shell"><section className="card"><h1>Story Room not found</h1></section></main>;
  }

  const signals = buildSignals({
    room,
    contributions: contributions ?? [],
    memoryCards: memoryCards ?? [],
    storyMaps: storyMaps ?? [],
    capsules: capsules ?? []
  });
  const nextMove = buildNextMove(signals);
  const deliveryChecklist = buildDeliveryChecklist(signals);
  const reusableAssets = buildReusableAssets(signals);
  const postflightQuestions = buildPostflightQuestions(signals);
  const reusabilityScore = calculateReusabilityScore(signals);
  const latestCapsule = (capsules ?? [])[0];

  return (
    <main className="shell stack">
      <section className="card stack">
        <p className="kicker">Operator Recovery</p>
        <h1>{room.title}</h1>
        <p>
          This is the center-core recovery page. A Capsule is not operationally complete until it produces reusable prompts, section patterns, delivery learning, and a faster next launch.
        </p>
        <div className="metrics-grid">
          <div><strong>{reusabilityScore}%</strong><span>Reusability score</span></div>
          <div><strong>{signals.contributionCount}</strong><span>Contributions</span></div>
          <div><strong>{signals.memoryCardCount}</strong><span>Memory Cards</span></div>
          <div><strong>{signals.storyMapCount}</strong><span>Story Maps</span></div>
          <div><strong>{signals.capsuleCount}</strong><span>Capsules</span></div>
          <div><strong>{signals.delivered ? "Delivered" : "In flight"}</strong><span>Payload state</span></div>
        </div>
        <div className="page-actions">
          <Link className="btn" href={`/staff/story-rooms/${id}`}>Back to production room</Link>
          <Link className="btn secondary" href={`/story-rooms/${id}/progress`}>Family progress</Link>
          {latestCapsule?.web_slug ? <Link className="btn secondary" href={`/story-capsules/${latestCapsule.web_slug}`}>Capsule preview</Link> : null}
        </div>
      </section>

      <section className="card stack">
        <p className="kicker">Next recovery move</p>
        <h2>{nextMove.label}</h2>
        <p>{nextMove.action}</p>
        <p><strong>Why:</strong> {nextMove.reason}</p>
      </section>

      <section className="card stack">
        <p className="kicker">Delivery checklist</p>
        <h2>Payload success checks</h2>
        <p>The project is not truly complete until these checks are either complete or intentionally deferred.</p>
        <div className="grid">
          {deliveryChecklist.map((item) => (
            <div key={item.label} className="mini-card">
              <strong>{item.complete ? "✓" : "○"} {item.label}</strong>
              <p>{item.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="card stack">
        <p className="kicker">Reusable assets</p>
        <h2>What this Capsule teaches the next one</h2>
        <div className="grid">
          {reusableAssets.map((asset) => (
            <div key={asset.label} className="mini-card">
              <strong>{asset.ready ? "✓" : "○"} {asset.label}</strong>
              <p>{asset.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="card stack">
        <p className="kicker">Postflight review</p>
        <h2>Capture this before moving on</h2>
        <p>These questions make sure the project does not become one-off labor. The answers should become future prompts, templates, sales proof, or product fixes.</p>
        <ul className="action-list">
          {postflightQuestions.map((question) => <li key={question}>{question}</li>)}
        </ul>
      </section>

      <section className="card stack">
        <p className="kicker">Reflight rule</p>
        <h2>The next Capsule should be easier.</h2>
        <p>
          Before this project is considered fully recovered, identify one change that makes the next Capsule faster: a better prompt, a better template, a clearer screen, or a reusable section pattern.
        </p>
      </section>
    </main>
  );
}
