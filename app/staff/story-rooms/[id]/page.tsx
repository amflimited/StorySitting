import { requireStaff } from "@/lib/auth";
import { createMemoryCard, updateContributionStatus, createStoryMap } from "./server-actions";

export default async function StaffRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireStaff();

  const { data: room } = await supabase
    .from("story_rooms")
    .select("*")
    .eq("id", id)
    .single();

  const { data: contributions } = await supabase
    .from("contributions")
    .select("*")
    .eq("story_room_id", id)
    .order("submitted_at", { ascending: false });

  const { data: memoryCards } = await supabase
    .from("memory_cards")
    .select("*")
    .eq("story_room_id", id)
    .order("created_at", { ascending: false });

  const { data: storyMaps } = await supabase
    .from("story_maps")
    .select("*")
    .eq("story_room_id", id)
    .order("created_at", { ascending: false });

  if (!room) return <main className="shell"><div className="card">Room not found.</div></main>;

  return (
    <main className="shell stack">
      <div>
        <p className="kicker">Staff room detail</p>
        <h1>{room.title}</h1>
        <p>{room.subject_name}</p>
        <span className="badge">{room.production_status}</span>
      </div>

      <section className="card">
        <h2>Create Story Map draft</h2>
        <form action={createStoryMap} className="stack">
          <input type="hidden" name="story_room_id" value={id} />
          <label>Story focus<input name="story_focus" placeholder="Kitchen table / family home / parent story" /></label>
          <label>Main themes<textarea name="themes" placeholder="Home, food, ordinary love, farm transition..." /></label>
          <label>Open questions<textarea name="open_questions" placeholder="What should we ask in the interview?" /></label>
          <button type="submit">Create Story Map</button>
        </form>
      </section>

      <section className="card">
        <h2>Contributions</h2>
        <div className="stack">
          {(contributions ?? []).map((c) => (
            <div key={c.id} className="card">
              <span className="badge">{c.review_status}</span>
              <h2>{c.title || "Untitled"}</h2>
              <p><strong>{c.contribution_type}</strong> from {c.source}</p>
              <p>{c.body}</p>
              <form action={updateContributionStatus} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input type="hidden" name="story_room_id" value={id} />
                <input type="hidden" name="contribution_id" value={c.id} />
                <button name="status" value="approved">Approve</button>
                <button name="status" value="archived">Archive</button>
                <button name="status" value="needs_followup">Needs followup</button>
              </form>
              <form action={createMemoryCard} className="stack" style={{ marginTop: 14 }}>
                <input type="hidden" name="story_room_id" value={id} />
                <input type="hidden" name="contribution_id" value={c.id} />
                <label>Memory Card title<input name="title" defaultValue={c.title ?? ""} /></label>
                <label>Summary<textarea name="summary" defaultValue={c.body ?? ""} /></label>
                <label>Quote<input name="quote" /></label>
                <label>Themes<input name="themes" placeholder="home, recipes, childhood" /></label>
                <button type="submit">Create Memory Card</button>
              </form>
            </div>
          ))}
        </div>
      </section>

      <section className="grid">
        <div className="card">
          <h2>Memory Cards</h2>
          {(memoryCards ?? []).map((m) => (
            <div key={m.id}>
              <p><strong>{m.title}</strong></p>
              <p>{m.summary}</p>
            </div>
          ))}
        </div>
        <div className="card">
          <h2>Story Maps</h2>
          {(storyMaps ?? []).map((m) => (
            <div key={m.id}>
              <p><strong>Version {m.version}</strong> — {m.status}</p>
              <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(m.outline, null, 2)}</pre>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
