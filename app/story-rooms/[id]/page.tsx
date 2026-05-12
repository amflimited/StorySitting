import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createInvite } from "./server-actions";
import { absoluteUrl } from "@/lib/utils";

export default async function StoryRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireUser();

  const { data: room, error } = await supabase
    .from("story_rooms")
    .select("id,title,subject_name,package_tier,production_status,onboarding_data")
    .eq("id", id)
    .single();

  if (error || !room) {
    return <main className="shell"><div className="card">Story Room not found.</div></main>;
  }

  const { data: invites } = await supabase
    .from("invites")
    .select("id,invite_token,email,phone,status,created_at")
    .eq("story_room_id", id)
    .order("created_at", { ascending: false });

  const { data: contributions } = await supabase
    .from("contributions")
    .select("id,title,contribution_type,review_status,submitted_at")
    .eq("story_room_id", id)
    .order("submitted_at", { ascending: false });

  return (
    <main className="shell stack">
      <div>
        <p className="kicker">Story Room</p>
        <h1>{room.title}</h1>
        <p>{room.subject_name}</p>
        <span className="badge">{room.production_status}</span>
      </div>

      <div className="grid">
        <section className="card">
          <h2>Invite contributor</h2>
          <form action={createInvite} className="stack">
            <input type="hidden" name="story_room_id" value={id} />
            <label>Name<input name="display_name" /></label>
            <label>Email<input name="email" type="email" /></label>
            <label>Phone<input name="phone" /></label>
            <button type="submit">Create invite link</button>
          </form>
        </section>

        <section className="card">
          <h2>Invite links</h2>
          <div className="stack">
            {(invites ?? []).map((invite) => (
              <div key={invite.id}>
                <p><strong>{invite.email || invite.phone || "Contributor"}</strong> <span className="status">{invite.status}</span></p>
                <code>{absoluteUrl(`/invite/${invite.invite_token}`)}</code>
              </div>
            ))}
            {(!invites || invites.length === 0) && <p>No invites yet.</p>}
          </div>
        </section>
      </div>

      <section className="card">
        <h2>Recent contributions</h2>
        <table>
          <thead><tr><th>Title</th><th>Type</th><th>Status</th><th>Submitted</th></tr></thead>
          <tbody>
            {(contributions ?? []).map((c) => (
              <tr key={c.id}><td>{c.title || "Untitled"}</td><td>{c.contribution_type}</td><td>{c.review_status}</td><td>{new Date(c.submitted_at).toLocaleString()}</td></tr>
            ))}
          </tbody>
        </table>
        {(!contributions || contributions.length === 0) && <p>No contributions yet.</p>}
      </section>
    </main>
  );
}
