import { requireStaff } from "@/lib/auth";
import { buildMemoryCardDraft, listToCsv } from "@/lib/memory-card-drafts";
import { buildProductionChecklist, checklistPercent, nextChecklistAction } from "@/lib/production-checklist";
import { WorkflowGuide } from "@/components/WorkflowGuide";
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

function statusLabel(value: string | null | undefined) {
  return value ? value.replaceAll("_", " ") : "unknown";
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

  if (!room) {
    return <main className="shell"><div className="card">Room not found.</div></main>;
  }

  const contributionList = contributions ?? [];
  const memoryCardList = memoryCards ?? [];
  const storyMapList = storyMaps ?? [];
  const capsuleList = capsules ?? [];

  const needsReview = contributionList.filter((c: any) => c.review_status === "needs_review").length;
  const approved = contributionList.filter((c: any) => c.review_status === "approved").length;
  const used = contributionList.filter((c: any) => c.review_status === "used_in_memory_card").length;
  const draftCards = memoryCardList.filter((m: any) => m.status === "draft").length;
  const selectedCards = memoryCardList.filter((m: any) => m.status === "selected").length;
  const voiceCount = contributionList.filter((c: any) => ["audio", "transcript", "summary"].includes(c.contribution_type)).length;
  const photoCount = contributionList.filter((c: any) => c.contribution_type === "photo").length;

  const checklist = buildProductionChecklist({
    contributionCount: contributionList.length,
    needsReviewCount: needsReview,
    approvedCount: approved,
    memoryCardCount: memoryCardList.length,
    selectedMemoryCardCount: selectedCards,
    storyMapCount: storyMapList.length,
    artifactCount: 0,
    capsuleCount: capsuleList.length,
    voiceCount,
    photoCount
  });
  const percent = checklistPercent(checklist);
  const nextAction = nextChecklistAction(checklist);

  return (
    <main className="shell stack">
      <div>
        <p className="kicker">Production room</p>
        <h1>{room.title}</h1>
        <p>{room.subject_name}</p>
        <span className="badge">{statusLabel(room.production_status)}</span>
      </div>

      <WorkflowGuide
        role="staff"
        status={room.production_status}
        title="Staff production phase"
        justHappened="This room is the workspace for turning raw family material into Memory Cards, a Story Map, and a deliverable Story Capsule."
      />

      <section className="card stack">
        <div className="between">
          <div>
            <p className="kicker">Capsule completion checklist</p>
            <h2>{percent}% ready for Capsule production</h2>
            <p>The checklist keeps this project moving toward a finished deliverable instead of becoming a pile of submissions.</p>
          </div>
          <span className="badge strong">Next: {nextAction?.label ?? "Complete"}</span>
        </div>
        <div className="progress"><span style={{ width: `${percent}%` }} /></div>
        <div className="mini-card">
          <strong>Next required action</strong>
          <p>{nextAction?.nextAction ?? "This project is ready for final delivery review."}</p>
        </div>
        <div className="stack">
          {checklist.map((item) => (
            <div key={item.key} className="mini-card checklist-item">
              <div className="between">
                <strong>{item.complete ? "✓" : "○"} {item.label}</strong>
                <span className="badge">{item.complete ? "done" : "needed"}</span>
              </div>
              <p>{item.detail}</p>
              {!item.complete && <p><strong>Action:</strong> {item.nextAction}</p>}
            </div>
          ))}
        </div>
      </section>

      <section className="grid">
        <div className="card"><p className="kicker">Contributions</p><h2>{contributionList.length}</h2><p>{needsReview} needs review · {approved} approved · {used} used</p></div>
        <div className="card"><p className="kicker">Memory Cards</p><h2>{memoryCardList.length}</h2><p>{draftCards} draft · {selectedCards} selected</p></div>
        <div className="card"><p className="kicker">Story Maps</p><h2>{storyMapList.length}</h2><p>Interview and production maps</p></div>
        <div className="card"><p className="kicker">Capsules</p><h2>{capsuleList.length}</h2><p>Delivery records</p></div>
      </section>

      <section className="card">
        <h2>Production status</h2>
        <p>Use this to move the room to the next operational phase after completing the checklist action.</p>
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
            <p>Memory Cards are the bridge between raw contributions and the Story Map. Draft them, select the strongest ones, then generate a Story Map.</p>
          </div>
          <form action={createStoryMapFromMemoryCards}>
            <input type="hidden" name="story_room_id" value={id} />
            <button type="submit">Generate Story Map from Memory Cards</button>
          </form>
        </div>
        <div className="metrics-grid">
          <div><strong>{memoryCardList.length}</strong><span>Total cards</span></div>
          <div><strong>{draftCards}</strong><span>Draft</span></div>
          <div><strong>{selectedCards}</strong><span>Selected</span></div>
          <div><strong>{memoryCardList.filter((m: any) => m.status === "needs_followup").length}</strong><span>Needs followup</span></div>
          <div><strong>{memoryCardList.filter((m: any) => m.quote).length}</strong><span>With quote</span></div>
          <div><strong>{memoryCardList.filter((m: any) => (m.themes ?? []).length > 0).length}</strong><span>With themes</span></div>
        </div>
      </section>

      <section className="card">
        <h2>Contributions</h2>
        <p>Review each contribution. Useful material should become a Memory Card or a follow-up question.</p>
        <div className="stack">
          {contributionList.map((c: any) => {
            const draft = buildMemoryCardDraft(c);
            return (
              <div key={c.id} className="card stack">
                <div className="between">
                  <span className="badge">{statusLabel(c.review_status)}</span>
                  <span className="badge">{c.contribution_type}</span>
                </div>
                <h2>{c.title || "Untitled"}</h2>
                <p>{c.body}</p>

                <form action={updateContributionStatus} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <input type="hidden" name="story_room_id" value={id} />
                  <input type="hidden" name="contribution_id" value={c.id} />
                  <button name="status" value="approved">Approve</button>
                  <button name="status" value="archived">Archive</button>
                  <button name="status" value="needs_followup">Needs followup</button>
                </form>

                <div className="mini-card">
                  <p className="kicker">Draft Memory Card suggestion</p>
                  <h3>{draft.title}</h3>
                  <p>{draft.summary}</p>
                  {draft.quote && <p><em>“{draft.quote}”</em></p>}
                  <p>Themes: {listToCsv(draft.themes) || "none yet"}</p>
                  <form action={createDraftMemoryCard}>
                    <input type="hidden" name="story_room_id" value={id} />
                    <input type="hidden" name="contribution_id" value={c.id} />
                    <button type="submit">Use draft as Memory Card</button>
                  </form>
                </div>

                <details className="card">
                  <summary><strong>Create edited Memory Card manually</strong></summary>
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
                </details>
              </div>
            );
          })}
          {contributionList.length === 0 && <p>No contributions yet. Invite contributors from the family Story Room.</p>}
        </div>
      </section>

      <section className="grid">
        <div className="card stack">
          <h2>Memory Cards</h2>
          {memoryCardList.map((m: any) => (
            <div key={m.id} className="mini-card">
              <div className="between"><strong>{m.title}</strong><span className="status">{statusLabel(m.status)}</span></div>
              {m.quote && <p><em>“{m.quote}”</em></p>}
              <p>{m.summary}</p>
              {m.themes && <p><strong>Themes:</strong> {m.themes.join(", ")}</p>}
              <form action={updateMemoryCardStatus} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input type="hidden" name="story_room_id" value={id} />
                <input type="hidden" name="memory_card_id" value={m.id} />
                <button name="status" value="selected">Select for map</button>
                <button name="status" value="needs_followup">Needs followup</button>
                <button name="status" value="archived">Archive</button>
              </form>
            </div>
          ))}
          {memoryCardList.length === 0 && <p>No Memory Cards yet. Use draft suggestions from contributions first.</p>}
        </div>

        <div className="card stack">
          <h2>Story Maps</h2>
          {storyMapList.map((m: any) => (
            <div key={m.id} className="mini-card">
              <p><strong>Version {m.version}</strong> — {statusLabel(m.status)}</p>
              <p><strong>Focus:</strong> {outlineValue(m.outline?.story_focus)}</p>
              <p><strong>Themes:</strong> {outlineValue(m.outline?.themes)}</p>
              <p><strong>Open questions:</strong> {outlineValue(m.outline?.open_questions)}</p>
              <p><strong>Interview plan:</strong> {outlineValue(m.outline?.interview_plan)}</p>
            </div>
          ))}
          {storyMapList.length === 0 && <p>No Story Maps yet. Select Memory Cards, then generate the first map.</p>}
        </div>
      </section>

      <section className="card">
        <h2>Create Story Map manually</h2>
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
        <h2>Story Capsule delivery record</h2>
        <p>Create a draft Capsule record so delivery has a system location before PDF generation exists.</p>
        <form action={createStoryCapsulePlaceholder} className="stack">
          <input type="hidden" name="story_room_id" value={id} />
          <label>Capsule title<input name="title" placeholder="Mary Ellen's Kitchen Table" /></label>
          <label>Web slug<input name="web_slug" placeholder="mary-ellen-kitchen-table" /></label>
          <label>Included assets<textarea name="included_assets" placeholder="PDF, 3 audio excerpts, 10 captions, quote cards..." /></label>
          <label>Delivery note<textarea name="delivery_note" placeholder="Private draft delivery note for this capsule." /></label>
          <button type="submit">Create Capsule record</button>
        </form>
      </section>
    </main>
  );
}
