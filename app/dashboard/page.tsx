import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { safeDate, safeStatus } from "@/lib/relations";
import { currentWorkflowStep, nextWorkflowStep, actionForRole, capsuleEndGoal } from "@/lib/capsule-workflow";
import { ProductVisualPanel } from "@/components/ProductVisualPanel";
import { getProductVisual } from "@/lib/product-visuals";

function attentionLabel(status?: string | null) {
  const step = currentWorkflowStep(status);
  return step.plainLabel;
}

export default async function DashboardPage() {
  const { supabase, user } = await requireUser();

  const { data: accounts } = await supabase
    .from("customer_accounts")
    .select("id")
    .eq("owner_user_id", user.id);

  const accountIds = (accounts ?? []).map((a) => a.id);

  const { data: rooms } = accountIds.length
    ? await supabase
        .from("story_rooms")
        .select("id,title,subject_name,package_tier,production_status,created_at")
        .in("customer_account_id", accountIds)
        .order("created_at", { ascending: false })
    : { data: [] as any[] };

  const roomCount = rooms?.length ?? 0;
  const activeRooms = (rooms ?? []).filter((room) => !["complete", "delivered", "archived"].includes(room.production_status ?? ""));
  const primaryRoom = activeRooms[0] ?? rooms?.[0] ?? null;
  const activeStep = currentWorkflowStep(primaryRoom?.production_status);
  const nextStep = nextWorkflowStep(primaryRoom?.production_status);
  const heroVisual = getProductVisual(primaryRoom ? "private-capsule-mobile" : "signature-capsule-lineup");

  return (
    <main className="shell stack">
      <section className="card stack command-card">
        <div className="between">
          <div style={{ maxWidth: 620 }}>
            <p className="kicker">Command center</p>
            <h1>Move the next Story Capsule toward a finished keepsake.</h1>
            <p>{primaryRoom ? `Current focus: ${primaryRoom.title}` : "Start with one memory, then guide it toward the voice, the story, the keepsake, and the private archive."}</p>
          </div>
          {heroVisual && (
            <div className="product-hero-image" style={{ width: 360, maxWidth: "100%" }}>
              <img src={heroVisual.src} alt={heroVisual.title} />
            </div>
          )}
        </div>

        <div className="between">
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link className="btn" href="/story-rooms/new">Start a Story Room</Link>
            <Link className="btn secondary" href="/homeplace">Start Homeplace Map</Link>
          </div>
        </div>

        <div className="grid">
          <div className="mini-card">
            <strong>Where you are</strong>
            <p>{primaryRoom ? `${activeStep.label}: ${activeStep.purpose}` : "No active Story Room yet."}</p>
          </div>
          <div className="mini-card">
            <strong>Next action</strong>
            <p>{primaryRoom ? actionForRole(activeStep, "owner") : "Create one focused Story Room around a person, recipe, place, milestone, or memory."}</p>
          </div>
          <div className="mini-card">
            <strong>Next phase</strong>
            <p>{primaryRoom ? `${nextStep.label}: ${nextStep.purpose}` : "Gather one useful family memory."}</p>
          </div>
          <div className="mini-card">
            <strong>End goal</strong>
            <p>{capsuleEndGoal()}</p>
          </div>
        </div>
      </section>

      <ProductVisualPanel
        keys={["voice-portrait", "heirloom-box", "first-listen-family"]}
        title="Keep the finished product visible while you work."
        intro="Every room should move toward a real end product: a Voice Portrait, a Story Book, a private Capsule page, and a family moment of listening."
      />

      <section className="metrics-grid">
        <div><strong>{roomCount}</strong><span>Total rooms</span></div>
        <div><strong>{activeRooms.length}</strong><span>Active Capsules</span></div>
        <div><strong>{user.email?.split("@")[0] ?? "owner"}</strong><span>Account owner</span></div>
      </section>

      <section className="card stack">
        <div className="between">
          <div>
            <p className="kicker">Your active rooms</p>
            <h2>Open the room that needs the next action.</h2>
            <p>Each Story Room now tells you where the Capsule stands and what has to happen next.</p>
          </div>
          <Link className="btn secondary" href="/staff">Staff production view</Link>
        </div>

        <div className="grid">
          {(rooms ?? []).map((room) => {
            const step = currentWorkflowStep(room.production_status);
            return (
              <Link key={room.id} href={`/story-rooms/${room.id}`} className="card stack" style={{ textDecoration: "none" }}>
                <div className="between">
                  <span className="badge">{safeStatus(room.production_status)}</span>
                  <span className="muted">{safeDate(room.created_at)}</span>
                </div>
                <h2>{room.title}</h2>
                <p>{room.subject_name || "No subject selected yet"}</p>
                <div className="mini-card">
                  <strong>Current step: {attentionLabel(room.production_status)}</strong>
                  <p>{actionForRole(step, "owner")}</p>
                </div>
              </Link>
            );
          })}
        </div>

        {(!rooms || rooms.length === 0) && (
          <div className="card stack empty-state">
            <p className="kicker">Start here</p>
            <h2>No Story Rooms yet.</h2>
            <p>Create your first room around one person, recipe, home, object, tradition, milestone, or family transition. The system will guide the rest.</p>
            <div><Link className="btn" href="/story-rooms/new">Start with one memory</Link></div>
          </div>
        )}
      </section>
    </main>
  );
}
