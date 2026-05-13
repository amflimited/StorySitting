import { requireStaff } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildMemoryCardDraft, listToCsv } from "@/lib/memory-card-drafts";
import {
  createMemoryCard,
  createDraftMemoryCard,
  updateContributionStatus,
  createStoryMap,
  createStoryMapFromMemoryCards,
  updateMemoryCardStatus,
  updateStoryRoomStatus,
  createStoryCapsulePlaceholder
} from "./server-actions";

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

function statusLabel(value: string | null | undefined) {
  return value ? value.replaceAll("_", " ") : "unknown";
}

function artifactPreview(artifact: ArtifactView) {
  if (!artifact.signed_url) return <p className="status">{artifact.signed_url_error || "Could not create signed URL"}</p>;

  if (artifact.mime_type?.startsWith("image/")) {
    return (
      <a href={artifact.signed_url} target="_blank" rel="noreferrer">
        <img
          src={artifact.signed_url}
          alt={artifact.file_name || "Uploaded image"}
          style={{ width: "100%", maxWidth: 320, borderRadius: 14, border: "1px solid var(--line)" }}
        />
      </a>
    );
  }

  if (artifact.mime_type?.startsWith("audio/")) {
    return <audio src={artifact.signed_url} controls style={{ width: "100%" }} />;
  }

  return <a className="btn secondary" href={artifact.signed_url} target="_blank" rel="noreferrer">Open file</a>;
}

function outlineValue(value: unknown) {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object" && value !== null) return JSON.stringify(value, null, 2);
  return String(value ?? "");
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

  const { data: capsules } = await supabase
    .from("story_capsules")
    .select("*")
    .eq("story_room_id", id)
    .order("created_at", { ascending: false });

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

  const needsReview = (contributions ?? []).filter((c) => c.review_status === "needs_review").length;
  const approved = (contributions ?? []).filter((c) => c.review_status === "approved").length;
  const used = (contributions ?? []).filter((c) => c.review_status === "used_in_memory_card").length;
  const draftCards = (memoryCards ?? []).filter((m) => m.status === "draft").length;
  const selectedCards = (memoryCards ?? []).filter((m) => m.status === "selected").length;

  return (
    <main className="shell stack">
      <div>
        <p className="kicker">Production room v0.4</p>
        <h1>{room.title}</h1>
        <p>{room.subject_name}</p>
        <span className="badge">{statusLabel(room.production_status)}</span>
      </div>

      <section className="grid">
        <div className="card"><p className="kicker">Contributions</p><h2>{contributions?.length ?? 0}</h2><p>{needsReview} needs review · {approved} approved · {used} used</p></div>
        <div className="card"><p className="kicker">Artifacts</p><h2>{artifacts.length}</h2><p>Private uploaded files</p></div>
        <div className="card"><p className="kicker">Memory Cards</p><h2>{memoryCards?.length ?? 0}</h2><p>{draftCards} draft · {selectedCards} selected</p></div>
        <div className="card"><p className="kicker">Story Maps</p><h2>{storyMaps?.length ?? 0}</h2><p>Interview/production maps</p></div>
      </section>

      <section className="card">
        <h2>Production status</h2>
        <form action={updateStoryRoomStatus} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
          <input type="hidden" name="story_room_id" value={id} />
          <label style={{ minWidth: 260 }}>Status
            <select name="production_status" defaultValue={room.production_status}>
              <option value="onboarding">Onboarding</option>
              <option value="gathering_contributions">Gathering contributions</option>
              <option value="needs_staff_review">Needs staff review</option>
              <option value="story_map_in_progress">Story Map in progress</option>
              <option value="ready_for_interview">Ready for interview</option>
              <option value="interview_complete">Interview complete</option>
              <option value="capsule_production">Capsule production</option>
              <option value="client_review">Client review</option>
              <option value="delivered">Delivered</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <button type="submit">Update status</button>
        </form>
      </section>

      <section className="card stack">
        <div className="between">
          <div>
            <p className="kicker">Memory Card workflow</p>
            <h2>Build story blocks from approved material</h2>
            <p>Memory Cards are the bridge between raw contributions and the Story Map. Draft them, select the strongest ones, then generate a Story Map from the selected set.</p>
          </div>
          <form action={createStoryMapFromMemoryCards}>
            <input type="hidden" name="story_room_id" value={id} />
            <button type="submit">Generate Story Map from Memory Cards</button>
          </form>
        </div>
        <div className="metrics-grid">
          <div><strong>{memoryCards?.length ?? 0}</strong><span>Total cards</span></div>
          <div><strong>{draftCards}</strong><span>Draft</span></div>
          <div><strong>{selectedCards}</strong><span>Selected</span></div>
          <div><strong>{(memoryCards ?? []).filter((m) => m.status === "needs_followup").length}</strong><span>Needs followup</span></div>
          <div><strong>{(memoryCards ?? []).filter((m) => m.quote).length}</strong><span>With quote</span></div>
          <div><strong>{(memoryCards ?? []).filter((m) => (m.themes ?? []).length > 0).length}</strong><span>With themes</span></div>
        </div>
      </section>

      <section className="card">
        <h2>Artifact check</h2>
        <p><strong>{artifacts.length}</strong> artifact record{artifacts.length === 1 ? "" : "s"} found for this Story Room.</p>
        {artifacts.length > 0 && (
          <div className="grid">
            {artifacts.map((artifact) => (
              <div key={artifact.id} className="card">
                <p><strong>{artifact.file_name || artifact.storage_path}</strong></p>
                <p>{artifact.mime_type || artifact.artifact_type || "file"} · {formatBytes(artifact.file_size_bytes)}</p>
                {artifactPreview(artifact)}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h2>Create Story Map draft manually</h2>
        <form action={createStoryMap} className="stack">
          <input type="hidden" name="story_room_id" value={id} />
          <label>Story focus<input name="story_focus" placeholder="Kitchen table / family home / parent story" /></label>
          <label>Main themes<textarea name="themes" placeholder="Home, food, ordinary love, farm transition..." /></label>
          <label>Open questions<textarea name="open_questions" placeholder="What should we ask in the interview?" /></label>
          <label>Interview plan<textarea name="interview_plan" placeholder="Warm-up, timeline, object/photo prompts, sensory/place prompts, closing reflection..." /></label>
          <label>Recommended output<textarea name="recommended_output" placeholder="Signature Story Capsule, PDF, voice clips, quote cards..." /></label>
          <button type="submit">Create Story Map</button>
        </form>
      </section>

      <section className="card">
        <h2>Contributions</h2>
        <div className="stack">
          {(contributions ?? []).map((c) => {
            const linkedArtifacts = artifactsByContribution.get(c.id) ?? [];
            const draft = buildMemoryCardDraft(c);
            return (
              <div key={c.id} className="card">
                <span className="badge">{statusLabel(c.review_status)}</span>
                <h2>{c.title || "Untitled"}</h2>
                <p><strong>{c.contribution_type}</strong> from {c.source}</p>
                <p>{c.body}</p>

                {linkedArtifacts.length > 0 && (
                  <div className="card" style={{ margin: "14px 0", background: "rgba(255,248,239,.78)" }}>
                    <h2>Attached file{linkedArtifacts.length === 1 ? "" : "s"}</h2>
                    <div className="grid">
                      {linkedArtifacts.map((artifact) => (
                        <div key={artifact.id}>
                          <p><strong>{artifact.file_name || artifact.storage_path}</strong></p>
                          <p>{artifact.mime_type || artifact.artifact_type || "file"} · {formatBytes(artifact.file_size_bytes)}</p>
                          {artifactPreview(artifact)}
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

                <div className="card" style={{ marginTop: 14, background: "rgba(255,255,255,.38)" }}>
                  <div className="between">
                    <div>
                      <p className="kicker">Draft suggestion</p>
                      <h3>{draft.title}</h3>
                      <p>{draft.summary}</p>
                      {draft.quote && <p><em>“{draft.quote}”</em></p>}
                      <p>Themes: {listToCsv(draft.themes) || "none yet"}</p>
                    </div>
                    <form action={createDraftMemoryCard}>
                      <input type="hidden" name="story_room_id" value={id} />
                      <input type="hidden" name="contribution_id" value={c.id} />
                      <button type="submit">Use draft</button>
                    </form>
                  </div>
                </div>

                <form action={createMemoryCard} className="stack" style={{ marginTop: 14 }}>
                  <input type="hidden" name="story_room_id" value={id} />
                  <input type="hidden" name="contribution_id" value={c.id} />
                  <label>Memory Card title<input name="title" defaultValue={draft.title} /></label>
                  <label>Summary<textarea name="summary" defaultValue={draft.summary} /></label>
                  <label>Quote<input name="quote" defaultValue={draft.quote} /></label>
                  <label>Themes<input name="themes" defaultValue={listToCsv(draft.themes)} placeholder="home, recipes, childhood" /></label>
                  <label>People<input name="people" defaultValue={listToCsv(draft.people)} placeholder="Mom, Grandpa, Aunt Linda" /></label>
                  <label>Places<input name="places" defaultValue={listToCsv(draft.places)} placeholder="Kitchen, farm, Indiana" /></label>
                  <label>Estimated date<input name="estimated_date" defaultValue={draft.estimated_date} placeholder="1968, 1980s, childhood" /></label>
                  <label>Life era<input name="life_era" defaultValue={draft.life_era} placeholder="Childhood / Work / Later life" /></label>
                  <button type="submit">Create edited Memory Card</button>
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
            <div key={m.id} className="card" style={{ marginBottom: 12 }}>
              <div className="between">
                <div>
                  <p><strong>{m.title}</strong> <span className="status">{statusLabel(m.status)}</span></p>
                  {m.quote && <p><em>“{m.quote}”</em></p>}
                  <p>{m.summary}</p>
                  {m.life_era && <p><strong>Era:</strong> {m.life_era}</p>}
                  {m.estimated_date && <p><strong>Date:</strong> {m.estimated_date}</p>}
                  {m.people && m.people.length > 0 && <p><strong>People:</strong> {m.people.join(", ")}</p>}
                  {m.places && m.places.length > 0 && <p><strong>Places:</strong> {m.places.join(", ")}</p>}
                  {m.themes && <p><strong>Themes:</strong> {m.themes.join(", ")}</p>}
                </div>
                <form action={updateMemoryCardStatus} className="stack" style={{ minWidth: 190 }}>
                  <input type="hidden" name="story_room_id" value={id} />
                  <input type="hidden" name="memory_card_id" value={m.id} />
                  <button name="status" value="selected">Select for map</button>
                  <button name="status" value="needs_followup">Needs followup</button>
                  <button name="status" value="archived">Archive</button>
                </form>
              </div>
            </div>
          ))}
          {(!memoryCards || memoryCards.length === 0) && <p>No Memory Cards yet.</p>}
        </div>
        <div className="card">
          <h2>Story Maps</h2>
          {(storyMaps ?? []).map((m) => (
            <div key={m.id} className="card" style={{ marginBottom: 12 }}>
              <p><strong>Version {m.version}</strong> — {statusLabel(m.status)}</p>
              <p><strong>Focus:</strong> {outlineValue(m.outline?.story_focus)}</p>
              <p><strong>Themes:</strong> {outlineValue(m.outline?.themes)}</p>
              <p><strong>People:</strong> {outlineValue(m.outline?.people)}</p>
              <p><strong>Places:</strong> {outlineValue(m.outline?.places)}</p>
              <p><strong>Open questions:</strong> {outlineValue(m.outline?.open_questions)}</p>
              <p><strong>Interview plan:</strong> {outlineValue(m.outline?.interview_plan)}</p>
              <p><strong>Recommended output:</strong> {outlineValue(m.outline?.recommended_output)}</p>
            </div>
          ))}
          {(!storyMaps || storyMaps.length === 0) && <p>No Story Maps yet.</p>}
        </div>
      </section>

      <section className="card">
        <h2>Story Capsule delivery placeholder</h2>
        <p>Create a draft capsule record so delivery has a system location before PDF generation exists.</p>
        <form action={createStoryCapsulePlaceholder} className="stack">
          <input type="hidden" name="story_room_id" value={id} />
          <label>Capsule title<input name="title" placeholder="Mary Ellen's Kitchen Table" /></label>
          <label>Web slug<input name="web_slug" placeholder="mary-ellen-kitchen-table" /></label>
          <label>Included assets<textarea name="included_assets" placeholder="PDF, 3 audio excerpts, 10 captions, quote cards..." /></label>
          <label>Delivery note<textarea name="delivery_note" placeholder="Private draft delivery note for this capsule." /></label>
          <button type="submit">Create capsule placeholder</button>
        </form>

        {(capsules ?? []).length > 0 && (
          <div style={{ marginTop: 18 }}>
            <h2>Capsule records</h2>
            {(capsules ?? []).map((capsule) => (
              <div className="card" key={capsule.id} style={{ marginBottom: 12 }}>
                <p><strong>{capsule.capsule_data?.title || capsule.web_slug || "Untitled capsule"}</strong></p>
                <p>Status: <span className="status">{statusLabel(capsule.status)}</span></p>
                <p>{capsule.capsule_data?.delivery_note}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
