import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { calculateStoryReadiness } from "@/lib/story-readiness";
import { currentWorkflowStep, actionForRole } from "@/lib/capsule-workflow";
import { PRODUCTION_COLUMNS, productionStageLabel } from "@/lib/capsule-intelligence";

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

  const [permissionCountResult, consentCountResult, chapterReleaseCountResult, deliveryCountResult] = await Promise.all([
    supabase.from("storyteller_permission_requests").select("id", { count: "exact", head: true }).eq("status", "identity_pending"),
    supabase.from("consent_events").select("id", { count: "exact", head: true }).eq("capture_method", "spoken_on_call").eq("verification_status", "pending"),
    supabase.from("story_chapters").select("id", { count: "exact", head: true }).eq("status", "storyteller_review"),
    supabase.from("story_chapter_deliveries").select("story_chapter_id", { count: "exact", head: true }).is("verified_at", null)
  ]);
  const pendingPermissionCount = permissionCountResult.count ?? 0;
  const pendingReleaseCount = (consentCountResult.count ?? 0) + (chapterReleaseCountResult.count ?? 0);
  const pendingDeliveryCount = deliveryCountResult.count ?? 0;

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
    return { room, readiness, contributions: roomContributions };
  });

  const nextPriorityRoom = [...roomReadiness].sort((a, b) => b.readiness.score - a.readiness.score)[0];

  return (
    <main className="shell stack">
      <section className="card stack command-card">
        <div>
          <p className="kicker">Mission Control</p>
          <h1>Move every story safely forward.</h1>
          <p>Permission, evidence, storyteller release, package verification, and delivery each have a visible desk. Nothing becomes family-facing just because a draft exists.</p>
        </div>

        <div className="grid">
          <div className="mini-card">
            <strong>Next project</strong>
            <p>{nextPriorityRoom ? nextPriorityRoom.room.title : "No active stories"}</p>
          </div>
          <div className="mini-card">
            <strong>Current step</strong>
            <p>{nextPriorityRoom ? productionStageLabel(nextPriorityRoom.room.production_status) : "No step yet"}</p>
          </div>
          <div className="mini-card">
            <strong>Do next</strong>
            <p>{nextPriorityRoom ? actionForRole(currentWorkflowStep(nextPriorityRoom.room.production_status), "staff") : "Wait for incoming material."}</p>
          </div>
          <div className="mini-card">
            <strong>Review queue</strong>
            <p>{statusLabel(status)}</p>
          </div>
        </div>
      </section>

      <section className="card stack">
        <div className="between">
          <div>
            <p className="kicker">Production board</p>
            <h2>Where every story is</h2>
            <p>This is the operating board. Sponsored-call work stays behind explicit consent and delivery gates; legacy rooms remain visible for migration.</p>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link className="btn" href="/staff/permissions">
              Verify storytellers{pendingPermissionCount ? ` · ${pendingPermissionCount}` : ""}
            </Link>
            <Link className="btn" href="/staff/consent-releases">
              Consent &amp; releases{pendingReleaseCount ? ` · ${pendingReleaseCount}` : ""}
            </Link>
            <Link className="btn" href="/staff/deliveries">
              Verify deliveries{pendingDeliveryCount ? ` · ${pendingDeliveryCount}` : ""}
            </Link>
            <Link className="btn" href="/demo-flight">Launch Demo Flight</Link>
            <Link className="btn secondary" href="/staff/import-quo">Import Quo</Link>
          </div>
        </div>

        <div className="grid">
          {PRODUCTION_COLUMNS.map((column) => {
            const columnRooms = roomReadiness.filter(({ room }) => room.production_status === column.key);
            return (
              <div className="mini-card stack" key={column.key}>
                <div className="between">
                  <strong>{column.label}</strong>
                  <span className="badge">{columnRooms.length}</span>
                </div>
                {columnRooms.slice(0, 4).map(({ room, readiness }) => (
                  <Link key={room.id} className="mini-card unstyled-link" href={`/staff/story-rooms/${room.id}`}>
                    <strong>{room.title}</strong>
                    <p>{readiness.score}% · {readiness.label}</p>
                  </Link>
                ))}
                {columnRooms.length === 0 ? <p>No projects here.</p> : null}
              </div>
            );
          })}
        </div>
      </section>

      <section className="card stack">
        <div className="between">
          <div>
            <p className="kicker">Mission queue</p>
            <h2>Which story moves next?</h2>
            <p>Use readiness to choose where to gather context, prepare a sitting, verify consent, or finish a family-ready result.</p>
          </div>
          <Link className="btn secondary" href="/debug/artifacts">Artifact Debug</Link>
        </div>

        <table>
          <thead><tr><th>Room</th><th>Readiness</th><th>Step</th><th>Do next</th></tr></thead>
          <tbody>
            {roomReadiness.map(({ room, readiness }) => {
              const workflow = currentWorkflowStep(room.production_status);
              return (
                <tr key={room.id}>
                  <td><Link href={`/staff/story-rooms/${room.id}`}>{room.title}</Link><br /><span className="muted">{room.subject_name || "No subject"}</span></td>
                  <td><strong>{readiness.score}%</strong><br /><span className="status">{readiness.label}</span></td>
                  <td>{productionStageLabel(room.production_status)}</td>
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
            <h2>Material review</h2>
            <p>Keep this simple: decide what each contribution becomes. Approve it, use it, ask a follow-up, or archive it.</p>
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
          <thead><tr><th>Contribution</th><th>Room</th><th>Type</th><th>Status</th><th>Use it for</th></tr></thead>
          <tbody>
            {(contributions ?? []).map((c: any) => (
              <tr key={c.id}>
                <td>{c.title || "Untitled"}</td>
                <td><Link href={`/staff/story-rooms/${c.story_room_id}`}>{c.story_rooms?.title ?? "Room"}</Link></td>
                <td>{c.contribution_type}</td>
                <td><span className="status">{statusLabel(c.review_status)}</span></td>
                <td>
                  {c.review_status === "needs_review" && "Decide what this is"}
                  {c.review_status === "approved" && "Make a Memory Card"}
                  {c.review_status === "used_in_memory_card" && "Use in Story Map or Capsule"}
                  {c.review_status === "needs_followup" && "Ask one clearer question"}
                  {c.review_status === "archived" && "No action"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
