import Link from "next/link";
import { requireStaff } from "@/lib/auth";

export default async function StaffPage() {
  const { supabase } = await requireStaff();

  const { data: rooms } = await supabase
    .from("story_rooms")
    .select("id,title,subject_name,package_tier,production_status,created_at")
    .order("created_at", { ascending: false });

  const { data: contributions } = await supabase
    .from("contributions")
    .select("id,title,contribution_type,review_status,submitted_at,story_room_id,story_rooms(title)")
    .eq("review_status", "needs_review")
    .order("submitted_at", { ascending: false })
    .limit(25);

  return (
    <main className="shell stack">
      <div>
        <p className="kicker">Staff console</p>
        <h1>Production control</h1>
        <p>Review Story Rooms, incoming Contributions, manual Quo imports, Memory Cards, Story Maps, and capsule delivery.</p>
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Link className="btn" href="/staff/import-quo">Manual Quo Import</Link>
      </div>
      <section className="card">
        <h2>Needs review</h2>
        <table>
          <thead><tr><th>Contribution</th><th>Room</th><th>Type</th><th>Status</th></tr></thead>
          <tbody>
            {(contributions ?? []).map((c: any) => (
              <tr key={c.id}>
                <td>{c.title || "Untitled"}</td>
                <td><Link href={`/staff/story-rooms/${c.story_room_id}`}>{c.story_rooms?.title ?? "Room"}</Link></td>
                <td>{c.contribution_type}</td>
                <td>{c.review_status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {(!contributions || contributions.length === 0) && <p>No pending contributions.</p>}
      </section>
      <section className="card">
        <h2>Story Rooms</h2>
        <table>
          <thead><tr><th>Room</th><th>Subject</th><th>Package</th><th>Status</th></tr></thead>
          <tbody>
            {(rooms ?? []).map((room) => (
              <tr key={room.id}>
                <td><Link href={`/staff/story-rooms/${room.id}`}>{room.title}</Link></td>
                <td>{room.subject_name}</td>
                <td>{room.package_tier}</td>
                <td>{room.production_status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
