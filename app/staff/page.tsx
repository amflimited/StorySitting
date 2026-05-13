import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { calculateStoryReadiness, productionStatusFromReadiness } from "@/lib/story-readiness";

function statusLabel(value: string | null | undefined) {
  return value ? value.replaceAll("_", " ") : "unknown";
}

export default async function StaffPage({
  searchParams
}: {
  searchParams?: Promise<{ status?: string }>
}) {
  const { supabase } = await requireStaff();
  const params = searchParams ? await searchParams : {};
  const status = params.status ?? "needs_review";

  const { data: rooms } = await supabase
    .from("story_rooms")
    .select("id,title,subject_name,package_tier,production_status,created_at,onboarding_data")
    .order("created_at", { ascending: false });

  let contributionQuery = supabase
    .from("contributions")
    .select("id,title,contribution_type,review_status,submitted_at,story_room_id,story_rooms(title)")
    .order("submitted_at", { ascending: false })
    .limit(50);

  if (status !== "all") {
    contributionQuery = contributionQuery.eq("review_status", status);
  }

  const { data: contributions } = await contributionQuery;

  const { data: allContributions } = await supabase
    .from("contributions")
    .select("id,story_room_id,contribution_type,review_status");

  const { data: invites } = await supabase
    .from("invites")
    .select("id,story_room_id,status");

  const roomReadiness = (rooms ?? []).map((room: any) => {
    const roomContributions = (allContributions ?? []).filter((item: any) => item.story_room_id === room.id);
    const onboarding = (room.onboarding_data ?? {}) as { why_now?: string; known_materials?: string };
    const readiness = calculateStoryReadiness({
      inviteCount: (invites ?? []).filter((invite: any) => invite.story_room_id === room.id).length,
      contributionCount: roomContributions.length,
      approvedCount: roomContributions.filter((item: any) => item.review_status === "approved" || item.review_status === "used_in_memory_card").length,
      contributions: roomContributions,
      whyNow: onboarding.why_now,
      knownMaterials: onboarding.known_materials
    });
    return { room, readiness };
  });

  const roomCounts = {
    onboarding: (rooms ?? []).filter((r) => r.production_status === "onboarding").length,
    mapReady: roomReadiness.filter((item) => item.readiness.phase === "map_ready").length,
    sessionReady: roomReadiness.filter((item) => item.readiness.phase === "session_ready" || item.readiness.phase === "capsule_ready").length,
    delivered: (rooms ?? []).filter((r) => r.production_status === "delivered").length,
    total: (rooms ?? []).length
  };

  return (
    <main className="shell stack">
      <div>
        <p className="kicker">Staff console v0.3</p>
        <h1>Production control</h1>
        <p>Review Story Rooms, incoming Contributions, Quo imports, Memory Cards, Story Maps, Artifacts, and delivery placeholders.</p>
      </div>

      <section className="grid">
        <div className="card"><p className="kicker">Rooms</p><h2>{roomCounts.total}</h2><p>Total Story Rooms</p></div>
        <div className="card"><p className="kicker">Onboarding</p><h2>{roomCounts.onboarding}</h2><p>Still gathering material</p></div>
        <div className="card"><p className="kicker">Map ready</p><h2>{roomCounts.mapReady}</h2><p>Enough material for a Story Map</p></div>
        <div className="card"><p className="kicker">Session ready</p><h2>{roomCounts.sessionReady}</h2><p>Ready for guided session prep</p></div>
      </section>

      <section className="card stack">
        <div className="between">
          <div>
            <p className="kicker">Mission queue</p>
            <h2>Story Room readiness</h2>
            <p>Use this to decide which rooms need gathering, mapping, session prep, or Capsule production next.</p>
          </div>
        </div>
        <table>
          <thead><tr><th>Room</th><th>Readiness</th><th>Production signal</th><th>Counts</th></tr></thead>
          <tbody>
            {roomReadiness.map(({ room, readiness }) => (
              <tr key={room.id}>
                <td><Link href={`/staff/story-rooms/${room.id}`}>{room.title}</Link><br /><span className="muted">{room.subject_name || "No subject"}</span></td>
                <td><strong>{readiness.score}%</strong><br /><span className="status">{readiness.label}</span></td>
                <td>{productionStatusFromReadiness(readiness)}</td>
                <td>{readiness.counts.contributions} contributions · {readiness.counts.voice} voice · {readiness.counts.photo} photos</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Link className="btn" href="/staff/import-quo">Manual Quo Import</Link>
        <Link className="btn secondary" href="/debug/artifacts">Artifact Debug</Link>
      </div>

      <section className="card">
        <div className="between">
          <div>
            <h2>Contribution review queue</h2>
            <p>Current filter: <strong>{statusLabel(status)}</strong></p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link className="btn secondary" href="/staff?status=needs_review">Needs review</Link>
            <Link className="btn secondary" href="/staff?status=approved">Approved</Link>
            <Link className="btn secondary" href="/staff?status=needs_followup">Needs followup</Link>
            <Link className="btn secondary" href="/staff?status=used_in_memory_card">Used</Link>
            <Link className="btn secondary" href="/staff?status=all">All</Link>
          </div>
        </div>

        <table>
          <thead><tr><th>Contribution</th><th>Room</th><th>Type</th><th>Status</th><th>Submitted</th></tr></thead>
          <tbody>
            {(contributions ?? []).map((c: any) => (
              <tr key={c.id}>
                <td>{c.title || "Untitled"}</td>
                <td><Link href={`/staff/story-rooms/${c.story_room_id}`}>{c.story_rooms?.title ?? "Room"}</Link></td>
                <td>{c.contribution_type}</td>
                <td><span className="status">{statusLabel(c.review_status)}</span></td>
                <td>{new Date(c.submitted_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {(!contributions || contributions.length === 0) && <p>No contributions for this filter.</p>}
      </section>

      <section className="card">
        <h2>Story Rooms</h2>
        <table>
          <thead><tr><th>Room</th><th>Subject</th><th>Package</th><th>Status</th><th>Created</th></tr></thead>
          <tbody>
            {(rooms ?? []).map((room) => (
              <tr key={room.id}>
                <td><Link href={`/staff/story-rooms/${room.id}`}>{room.title}</Link></td>
                <td>{room.subject_name}</td>
                <td>{room.package_tier}</td>
                <td><span className="status">{statusLabel(room.production_status)}</span></td>
                <td>{new Date(room.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
