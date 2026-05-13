import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { buildFamilyProgress, buildNextMove, buildSignals, buildDeliveryChecklist } from "@/lib/capsule-recovery";

export default async function FamilyProgressPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireUser();

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
  const progress = buildFamilyProgress(signals);
  const nextMove = buildNextMove(signals);
  const deliveryChecklist = buildDeliveryChecklist(signals);
  const latestCapsule = (capsules ?? [])[0];

  return (
    <main className="shell stack">
      <section className="card stack">
        <p className="kicker">Your Capsule Progress</p>
        <h1>{room.title}</h1>
        <p>{room.subject_name || "This page shows where your family project stands and what happens next."}</p>
        <div className="metrics-grid">
          <div><strong>{progress.score}%</strong><span>Progress</span></div>
          <div><strong>{progress.current.label}</strong><span>Current step</span></div>
          <div><strong>{signals.contributionCount}</strong><span>Memories received</span></div>
          <div><strong>{signals.memoryCardCount}</strong><span>Story blocks</span></div>
          <div><strong>{signals.storyMapCount}</strong><span>Story Maps</span></div>
          <div><strong>{signals.capsuleCount}</strong><span>Capsules</span></div>
        </div>
      </section>

      <section className="card stack">
        <p className="kicker">What happens next</p>
        <h2>{nextMove.label}</h2>
        <p>{nextMove.action}</p>
        <p><strong>Why:</strong> {nextMove.reason}</p>
        <div className="page-actions">
          <Link className="btn" href={`/story-rooms/${id}`}>Open Story Room</Link>
          {latestCapsule?.web_slug ? <Link className="btn secondary" href={`/story-capsules/${latestCapsule.web_slug}`}>Open Capsule preview</Link> : null}
        </div>
      </section>

      <section className="card stack">
        <p className="kicker">Progress path</p>
        <h2>From memories to finished Capsule</h2>
        <div className="stack">
          {progress.stages.map((stage, index) => (
            <div key={stage.label} className="mini-card">
              <div className="between">
                <strong>{stage.complete ? "✓" : "○"} {index + 1}. {stage.label}</strong>
                <span className="badge">{stage.complete ? "done" : "next"}</span>
              </div>
              <p>{stage.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="card stack">
        <p className="kicker">Final delivery checks</p>
        <h2>What still needs to be true before this feels finished</h2>
        <div className="grid">
          {deliveryChecklist.map((item) => (
            <div key={item.label} className="mini-card">
              <strong>{item.complete ? "✓" : "○"} {item.label}</strong>
              <p>{item.detail}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
