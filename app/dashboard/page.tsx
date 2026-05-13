import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { safeDate, safeStatus } from "@/lib/relations";

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
  const activeCount = (rooms ?? []).filter((room) => room.production_status !== "complete").length;

  return (
    <main className="shell stack">
      <div className="between">
        <div>
          <p className="kicker">Family owner dashboard</p>
          <h1>Your Story Rooms</h1>
          <p>Create private memory projects, track production, and organize contributors in one place.</p>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link className="btn" href="/story-rooms/new">Create Story Room</Link>
          <Link className="btn secondary" href="/staff">Staff View</Link>
        </div>
      </div>

      <section className="metrics-grid">
        <div>
          <strong>{roomCount}</strong>
          <span>Total rooms</span>
        </div>
        <div>
          <strong>{activeCount}</strong>
          <span>In progress</span>
        </div>
        <div>
          <strong>{user.email?.split("@")[0] ?? "owner"}</strong>
          <span>Account owner</span>
        </div>
      </section>

      <div className="grid">
        {(rooms ?? []).map((room) => (
          <Link
            key={room.id}
            href={`/story-rooms/${room.id}`}
            className="card"
            style={{ textDecoration: "none" }}
          >
            <div className="between">
              <span className="badge">{safeStatus(room.production_status)}</span>
              <span className="muted">{safeDate(room.created_at)}</span>
            </div>

            <h2>{room.title}</h2>
            <p>{room.subject_name || "No subject selected yet"}</p>

            <div className="mini-card">
              <strong>{room.package_tier || "Founding tier pending"}</strong>
              <p style={{ marginBottom: 0 }}>Open room and continue building the Story Capsule.</p>
            </div>
          </Link>
        ))}

        {(!rooms || rooms.length === 0) && (
          <div className="card stack">
            <h3>No Story Rooms yet</h3>
            <p>Create your first room to begin collecting stories, photos, objects, and voice memories.</p>
            <div>
              <Link className="btn" href="/story-rooms/new">Start First Room</Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
