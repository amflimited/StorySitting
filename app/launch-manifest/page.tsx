import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { LAUNCH_MANIFEST } from "@/lib/capsule-recovery";

export default async function LaunchManifestPage() {
  const { supabase } = await requireStaff();

  const { data: rooms } = await supabase
    .from("story_rooms")
    .select("id,title,subject_name,production_status,created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  const activeRooms = rooms ?? [];

  return (
    <main className="shell stack">
      <section className="card stack">
        <p className="kicker">Launch Manifest</p>
        <h1>From orbit to reusable launches</h1>
        <p>
          The goal is no longer only proving that a Story Room can become a Capsule. The goal is to make each launch produce a finished artifact, reusable learning, clearer templates, and a faster next flight.
        </p>
        <div className="page-actions">
          <Link className="btn" href="/demo-flight">Launch Demo Flight 1</Link>
          <Link className="btn secondary" href="/staff">Open Mission Control</Link>
        </div>
      </section>

      <section className="card stack">
        <p className="kicker">Flight program</p>
        <h2>Planned proof sequence</h2>
        <div className="grid">
          {LAUNCH_MANIFEST.map((flight) => (
            <article key={flight.key} className="mini-card stack">
              <div className="between">
                <span className="badge strong">{flight.status}</span>
                <span className="badge">{flight.key}</span>
              </div>
              <h3>{flight.title}</h3>
              <p><strong>Payload:</strong> {flight.payload}</p>
              <p>{flight.goal}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="card stack">
        <p className="kicker">Active vehicles</p>
        <h2>Current Story Rooms</h2>
        <p>Each active room should eventually land three things: family progress, operator recovery, and reusable assets.</p>
        <table>
          <thead><tr><th>Room</th><th>Status</th><th>Recovery links</th></tr></thead>
          <tbody>
            {activeRooms.map((room: any) => (
              <tr key={room.id}>
                <td><Link href={`/staff/story-rooms/${room.id}`}>{room.title}</Link><br /><span className="muted">{room.subject_name || "No subject"}</span></td>
                <td><span className="status">{String(room.production_status || "unknown").replaceAll("_", " ")}</span></td>
                <td>
                  <div className="page-actions">
                    <Link className="btn secondary" href={`/story-rooms/${room.id}/progress`}>Family progress</Link>
                    <Link className="btn secondary" href={`/staff/story-rooms/${room.id}/recovery`}>Operator recovery</Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card stack">
        <p className="kicker">New success standard</p>
        <h2>A Capsule is not complete until it improves the next Capsule.</h2>
        <ul className="action-list">
          <li>Payload success: the family receives a clear, finished artifact.</li>
          <li>Customer-side landing: the family understands progress without manual explanation.</li>
          <li>Operator-side landing: staff finishes without reinventing prompts, sections, or delivery language.</li>
          <li>Center-core recovery: reusable learning is captured after delivery.</li>
          <li>Reflight: the next Capsule launches faster using recovered assets.</li>
        </ul>
      </section>
    </main>
  );
}
