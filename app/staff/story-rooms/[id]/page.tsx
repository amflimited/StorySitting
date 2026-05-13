import { requireStaff } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createMemoryCard, updateContributionStatus, createStoryMap } from "./server-actions";

type ArtifactView = {
  id: string;
  contribution_id: string | null;
  story_room_id: string | null;
  storage_bucket: string;
  storage_path: string;
  file_name: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  artifact_type: string | null;
  signed_url?: string | null;
  signed_url_error?: string | null;
};

function formatBytes(bytes: number | null) {
  if (!bytes || bytes <= 0) return "unknown size";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size = size / 1024;
    unit++;
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

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

  // Hotfix v0.1.3:
  // The previous staff view showed contribution text but did not display uploaded files.
  // Artifacts are private, so signed URLs are created server-side with the admin client.
  const admin = createSupabaseAdminClient();
  const { data: artifactRows } = await admin
    .from("artifacts")
    .select("*")
    .eq("story_room_id", id)
    .order("created_at", { ascending: false });

  const artifacts: ArtifactView[] = [];
  for (const artifact of (artifactRows ?? []) as ArtifactView[]) {
    const { data, error } = await admin.storage
      .from(artifact.storage_bucket)
      .createSignedUrl(artifact.storage_path, 60 * 60);

    artifacts.push({
      ...artifact,
      signed_url: data?.signedUrl ?? null,
      signed_url_error: error?.message ?? null
    });
  }

  const artifactsByContribution = new Map<string, ArtifactView[]>();
  for (const artifact of artifacts) {
    if (!artifact.contribution_id) continue;
    const list = artifactsByContribution.get(artifact.contribution_id) ?? [];
    list.push(artifact);
    artifactsByContribution.set(artifact.contribution_id, list);
  }

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
        <h2>Artifact check</h2>
        <p>
          Uploaded photos, audio, PDFs, and documents appear here after they are stored as private
          Supabase Storage files and normalized into Artifact records.
        </p>
        <p><strong>{artifacts.length}</strong> artifact record{artifacts.length === 1 ? "" : "s"} found for this Story Room.</p>
        {artifacts.length > 0 && (
          <table>
            <thead><tr><th>File</th><th>Type</th><th>Size</th><th>Linked Contribution</th><th>Open</th></tr></thead>
            <tbody>
              {artifacts.map((artifact) => (
                <tr key={artifact.id}>
                  <td>{artifact.file_name || artifact.storage_path}</td>
                  <td>{artifact.mime_type || artifact.artifact_type || "file"}</td>
                  <td>{formatBytes(artifact.file_size_bytes)}</td>
                  <td>{artifact.contribution_id || "room-level"}</td>
                  <td>
                    {artifact.signed_url ? (
                      <a className="btn secondary" href={artifact.signed_url} target="_blank" rel="noreferrer">Open file</a>
                    ) : (
                      <span className="status">{artifact.signed_url_error || "No signed URL"}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

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
          {(contributions ?? []).map((c) => {
            const linkedArtifacts = artifactsByContribution.get(c.id) ?? [];
            return (
              <div key={c.id} className="card">
                <span className="badge">{c.review_status}</span>
                <h2>{c.title || "Untitled"}</h2>
                <p><strong>{c.contribution_type}</strong> from {c.source}</p>
                <p>{c.body}</p>

                {linkedArtifacts.length > 0 && (
                  <div className="card" style={{ margin: "14px 0", background: "rgba(255,248,239,.78)" }}>
                    <h2>Attached file{linkedArtifacts.length === 1 ? "" : "s"}</h2>
                    <div className="stack">
                      {linkedArtifacts.map((artifact) => (
                        <div key={artifact.id}>
                          <p><strong>{artifact.file_name || artifact.storage_path}</strong></p>
                          <p>{artifact.mime_type || artifact.artifact_type || "file"} · {formatBytes(artifact.file_size_bytes)}</p>
                          {artifact.signed_url ? (
                            <a className="btn secondary" href={artifact.signed_url} target="_blank" rel="noreferrer">Open uploaded file</a>
                          ) : (
                            <p className="status">{artifact.signed_url_error || "Could not create signed URL"}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

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
            );
          })}
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
