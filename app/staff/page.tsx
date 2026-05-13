import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { calculateStoryReadiness, productionStatusFromReadiness } from "@/lib/story-readiness";
import { currentWorkflowStep, actionForRole } from "@/lib/capsule-workflow";

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

  const nextPriorityRoom = roomReadiness.sort((a, b) => b.readiness.score - a.readiness.score)[0];

  return (
    <main className="shell stack">
      <section className="card stack command-card">
        <div>
          <p className="kicker">Production control</p>
          <h1>Staff operations pipeline</h1>
          <p>The goal is not managing files. The goal is advancing Capsules toward usable interviews, Memory Cards, and delivery-ready story artifacts.</p>
        </div>

        <div className="grid">
          <div className="mini-card">
            <strong>Priority room</strong>
            <p>{nextPriorityRoom ? nextPriorityRoom.room.title : "No active rooms"}</p>
          </div>
          <div className="mini-card">
            <strong>Current production phase</strong>
            <p>{nextPriorityRoom ? currentWorkflowStep(nextPriorityRoom.room.production_status).plainLabel : "No phase yet"}</p>
          </div>
          <div className="mini-card">
            <strong>Staff next move</strong>
            <p>{nextPriorityRoom ? actionForRole(currentWorkflowStep(nextPriorityRoom.room.production_status), "staff") : "Await incoming contributions."}</p>
          </div>
          <div className="mini-card">
            <strong>Queue filter</strong>
            <p>{statusLabel(status)}</p>
          </div>
        </div>
      </section>

      <section className="card stack">
        <div className="between">
          <div>
            <p className="kicker">Mission queue</p>
            <h2>Which Capsules move next?</h2>
            <p>Use readiness to determine where to gather more material, prepare interviews, or begin production work.</p>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link className="btn" href="/staff/import-quo">Import Quo</Link>
            <Link className="btn secondary" href="/debug/artifacts">Artifact Debug</Link>
          </div>
        </div>

        <table>
          <thead><tr><th>Room</th><th>Readiness</th><th>Workflow</th><th>Recommended action</th></tr></thead>
          <tbody>
            {roomReadiness.map(({ room, readiness }) => {
              const workflow = currentWorkflowStep(room.production_status);
              return (
                <tr key={room.id}>
                  <td><Link href={`/staff/story-rooms/${room.id}`}>{room.title}</Link><br /><span className="muted">{room.subject_name || "No subject"}</span></td>
                  <td><strong>{readiness.score}%</strong><br /><span className="status">{readiness.label}</span></td>
                  <td>{workflow.plainLabel}</td>
                  <td>{actionForRole(workflow, "staff")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="card stack">
        <div className="between">
          <div>
            <h2>Contribution review queue</h2>
            <p>Every reviewed contribution should either become useful production material or trigger follow-up collection.</p>
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
          <thead><tr><th>Contribution</th><th>Room</th><th>Type</th><th>Status</th><th>Next production use</th></tr></thead>
          <tbody>
            {(contributions ?? []).map((c: any) => (
              <tr key={c.id}>
                <td>{c.title || "Untitled"}</td>
                <td><Link href={`/staff/story-rooms/${c.story_room_id}`}>{c.story_rooms?.title ?? "Room"}</Link></td>
                <td>{c.contribution_type}</td>
                <td><span className="status">{statusLabel(c.review_status)}</span></td>
                <td>
                  {c.review_status === "needs_review" && "Review and classify"}
                  {c.review_status === "approved" && "Convert into Memory Card or prompt"}
                  {c.review_status === "used_in_memory_card" && "Ready for Story Map or interview"}
                  {c.review_status === "needs_followup" && "Request clarification or more detail"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
