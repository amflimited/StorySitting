import Link from "next/link";
import { requireUser } from "@/lib/auth";

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

  return (
    <main className="shell stack">
      <div>
        <p className="kicker">Family owner dashboard</p>
        <h1>Your Story Rooms</h1>
        <p>Create a private room, invite contributors, and track the path toward a Story Map and Story Capsule.</p>
      </div>
      <div><Link className="btn" href="/story-rooms/new">Create Story Room</Link></div>
      <div className="grid">
        {(rooms ?? []).map((room) => (
          <Link key={room.id} href={`/story-rooms/${room.id}`} className="card" style={{ textDecoration: "none" }}>
            <span className="badge">{room.production_status}</span>
            <h2>{room.title}</h2>
            <p>{room.subject_name || "No subject name yet"}</p>
            <p>{room.package_tier || "Package not selected"}</p>
          </Link>
        ))}
        {(!rooms || rooms.length === 0) && <div className="card"><p>No Story Rooms yet.</p></div>}
      </div>
    </main>
  );
}
