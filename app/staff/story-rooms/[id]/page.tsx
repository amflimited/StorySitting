import { requireStaff } from "@/lib/auth";
import { buildMemoryCardDraft, listToCsv } from "@/lib/memory-card-drafts";
import {
  buildProductionChecklist,
  checklistPercent,
  nextChecklistAction,
  recommendations,
  requiredBlockers
} from "@/lib/production-checklist";
import { categoryOptions } from "@/lib/story-capsule-categories";
import { WorkflowGuide } from "@/components/WorkflowGuide";
import {
  createMemoryCard,
  createDraftMemoryCard,
  updateContributionStatus,
  createStoryMap,
  createStoryMapFromMemoryCards,
  updateMemoryCardStatus,
  updateStoryRoomStatus,
  createStoryCapsuleFromStoryMap,
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

function ContributionCard({ contribution, storyRoomId }: { contribution: any; storyRoomId: string }) {
  const draft = buildMemoryCardDraft(contribution);
  const isUsed = contribution.review_status === "used_in_memory_card";

  return (
    <div className="mini-card stack">
      <div className="between">
        <div>
          <span className="badge strong">{statusLabel(contribution.review_status)}</span>
          <span className="badge" style={{ marginLeft: 8 }}>{contribution.contribution_type}</span>
        </div>
        {isUsed ? <span className="badge strong">structured</span> : null}
      </div>
      <div>
        <h3>{contribution.title || "Untitled contribution"}</h3>
        <p>{contribution.body || "No written body was submitted."}</p>
      </div>

      <form action={updateContributionStatus} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input type="hidden" name="story_room_id" value={storyRoomId} />
        <input type="hidden" name="contribution_id" value={contribution.id} />
        <button name="status" value="approved">Approve</button>
        <button name="status" value="needs_followup">Needs follow-up</button>
        <button name="status" value="archived">Archive</button>
      </form>

      {!isUsed ? (
        <div className="mini-card">
          <p className="kicker">Suggested Memory Card</p>
          <h3>{draft.title}</h3>
          <p>{draft.summary}</p>
          {draft.quote ? <p><em>“{draft.quote}”</em></p> : null}
          <p>Themes: {listToCsv(draft.themes) || "none yet"}</p>
          <form action={createDraftMemoryCard}>
            <input type="hidden" name="story_room_id" value={storyRoomId} />
            <input type="hidden" name="contribution_id" value={contribution.id} />
            <button type="submit">Turn into Memory Card</button>
          </form>
        </div>
      ) : null}

      <details className="card">
        <summary><strong>Create or edit Memory Card manually</strong></summary>
        <form action={createMemoryCard} className="stack" style={{ marginTop: 14 }}>
          <input type="hidden" name="story_room_id" value={storyRoomId} />
          <input type="hidden" name="contribution_id" value={contribution.id} />
          <label>Memory Card title<input name="title" defaultValue={draft.title} /></label>
          <label>Summary<textarea name="summary" defaultValue={draft.summary} /></label>
          <label>Quote<input name="quote" defaultValue={draft.quote} /></label>
          <label>Themes<input name="themes" defaultValue={listToCsv(draft.themes)} placeholder="recipes, childhood, marriage, work, holidays" /></label>
          <label>People<input name="people" defaultValue={listToCsv(draft.people)} placeholder="Mom, Grandpa, Aunt Linda" /></label>
          <label>Places<input name="places" defaultValue={listToCsv(draft.places)} placeholder="Kitchen, family home, church, hometown" /></label>
          <label>Estimated date<input name="estimated_date" defaultValue={draft.estimated_date} placeholder="1968, 1980s, childhood" /></label>
          <label>Life era<input name="life_era" defaultValue={draft.life_era} placeholder="Childhood / Marriage / Work / Later life" /></label>
          <button type="submit">Create edited Memory Card</button>
        </form>
      </details>
    </div>
  );
}

export default async function StaffRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireStaff();
  const categories = categoryOptions();

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

  const needsReviewList = contributionList.filter((c: any) => c.review_status === "needs_review");
  const approvedList = contributionList.filter((c: any) => c.review_status === "approved");
  const usedList = contributionList.filter((c: any) => c.review_status === "used_in_memory_card");
  const followupList = contributionList.filter((c: any) => c.review_status === "needs_followup");
  const archivedList = contributionList.filter((c: any) => c.review_status === "archived");

  const draftCards = memoryCardList.filter((m: any) => m.status === "draft").length;
  const selectedCards = memoryCardList.filter((m: any) => m.status === "selected").length;
  const voiceCount = contributionList.filter((c: any) => ["audio", "transcript", "summary"].includes(c.contribution_type)).length;
  const photoCount = contributionList.filter((c: any) => c.contribution_type === "photo").length;

  const checklist = buildProductionChecklist({
    contributionCount: contributionList.length,
    needsReviewCount: needsReviewList.length,
    approvedCount: approvedList.length,
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
  const blockers = requiredBlockers(checklist);
  const guidance = recommendations(checklist);
  const canBuildDraft = contributionList.length > 0 && memoryCardList.length > 0 && storyMapList.length > 0;

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
        justHappened="This room turns family material into Memory Cards, a Story Map, and a draft Story Capsule deliverable."
      />

      <section className="card stack">
        <div className="between">
          <div>
            <p className="kicker">Are we actually stuck?</p>
            <h2>{blockers.length ? "Required steps remain" : "You can continue to Capsule Builder"}</h2>
            <p>More contributions improve quality, but they are no longer treated as a hard lock during testing. A project can continue once it has material, review decisions, at least one Memory Card, and a Story Map.</p>
          </div>
          <span className="badge strong">{percent}% required path complete</span>
        </div>
        <div className="progress"><span style={{ width: `${percent}%` }} /></div>
        <div className="mini-card">
          <strong>Next required action</strong>
          <p>{nextAction?.nextAction ?? "This project is ready for final delivery review."}</p>
        </div>
        {blockers.length ? (
          <div className="grid">
            {blockers.map((item) => (
              <div key={item.key} className="mini-card">
                <span className="badge">required</span>
                <h3>{item.label}</h3>
                <p>{item.whyIncomplete}</p>
                <p><strong>Do this next:</strong> {item.nextAction}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="mini-card">
            <strong>No required blocker</strong>
            <p>You can build a draft Capsule now. Any remaining checklist items are quality recommendations, not locks.</p>
          </div>
        )}
      </section>

      {guidance.length ? (
        <section className="card stack">
          <p className="kicker">Quality recommendations</p>
          <h2>Helpful, not blocking</h2>
          <div className="grid">
            {guidance.map((item) => (
              <div key={item.key} className="mini-card">
                <span className="badge">optional</span>
                <h3>{item.label}</h3>
                <p>{item.whyIncomplete}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="grid">
        <div className="card"><p className="kicker">Needs review</p><h2>{needsReviewList.length}</h2><p>New material waiting for a decision.</p></div>
        <div className="card"><p className="kicker">Accepted / used</p><h2>{approvedList.length + usedList.length}</h2><p>{approvedList.length} approved · {usedList.length} structured into cards</p></div>
        <div className="card"><p className="kicker">Memory Cards</p><h2>{memoryCardList.length}</h2><p>{draftCards} draft · {selectedCards} selected</p></div>
        <div className="card"><p className="kicker">Story Maps / Capsules</p><h2>{storyMapList.length} / {capsuleList.length}</h2><p>Blueprints and draft deliverables.</p></div>
      </section>

      <section className="card stack">
        <div className="between">
          <div>
            <p className="kicker">Capsule Builder</p>
            <h2>Build the draft deliverable</h2>
            <p>The Story Map is the blueprint. The Capsule Builder turns the latest map and Memory Cards into a draft family-facing Capsule.</p>
          </div>
          <span className="badge strong">Map → Builder → Preview</span>
        </div>
        {!canBuildDraft ? (
          <div className="mini-card">
            <strong>Why this may not be ready yet</strong>
            <p>You need three practical pieces before the Builder has something useful to assemble: family material, at least one Memory Card, and a Story Map. It does not require five contributions for a test project.</p>
          </div>
        ) : null}
        <form action={createStoryCapsuleFromStoryMap} className="stack">
          <input type="hidden" name="story_room_id" value={id} />
          <label>Capsule category
            <select name="category_key" defaultValue="parent-grandparent">
              {categories.map((category) => (
                <option key={category.value} value={category.value}>{category.label}</option>
              ))}
            </select>
          </label>
          <button type="submit">Build Capsule draft from Story Map</button>
        </form>
      </section>

      <section className="card">
        <h2>Production status</h2>
        <p>Use this to move the room to the next operational phase after completing the required action.</p>
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
            <h2>Build story blocks from accepted material</h2>
            <p>Memory Cards are the bridge between raw contributions and the Story Map. You only need one to continue a test, but real Capsules improve with more.</p>
          </div>
          <form action={createStoryMapFromMemoryCards}>
            <input type="hidden" name="story_room_id" value={id} />
            <button type="submit">Generate Story Map from Memory Cards</button>
          </form>
        </div>
      </section>

      <section className="card stack">
        <div>
          <p className="kicker">Material Inbox</p>
          <h2>Review status is now separated</h2>
          <p>Start with “Needs review.” Accepted and used material is shown separately so the bottom of the page does not feel like one unsorted pile.</p>
        </div>

        <details open className="card">
          <summary><strong>Needs review ({needsReviewList.length})</strong></summary>
          <div className="stack" style={{ marginTop: 14 }}>
            {needsReviewList.map((c: any) => <ContributionCard key={c.id} contribution={c} storyRoomId={id} />)}
            {needsReviewList.length === 0 ? <p>No material needs review.</p> : null}
          </div>
        </details>

        <details open className="card">
          <summary><strong>Accepted and ready to structure ({approvedList.length})</strong></summary>
          <div className="stack" style={{ marginTop: 14 }}>
            {approvedList.map((c: any) => <ContributionCard key={c.id} contribution={c} storyRoomId={id} />)}
            {approvedList.length === 0 ? <p>No approved material waiting for Memory Cards.</p> : null}
          </div>
        </details>

        <details className="card">
          <summary><strong>Already structured into Memory Cards ({usedList.length})</strong></summary>
          <div className="stack" style={{ marginTop: 14 }}>
            {usedList.map((c: any) => <ContributionCard key={c.id} contribution={c} storyRoomId={id} />)}
            {usedList.length === 0 ? <p>No contributions have been turned into Memory Cards yet.</p> : null}
          </div>
        </details>

        <details className="card">
          <summary><strong>Needs follow-up ({followupList.length})</strong></summary>
          <div className="stack" style={{ marginTop: 14 }}>
            {followupList.map((c: any) => <ContributionCard key={c.id} contribution={c} storyRoomId={id} />)}
            {followupList.length === 0 ? <p>No follow-up items.</p> : null}
          </div>
        </details>

        <details className="card">
          <summary><strong>Archived ({archivedList.length})</strong></summary>
          <div className="stack" style={{ marginTop: 14 }}>
            {archivedList.map((c: any) => <ContributionCard key={c.id} contribution={c} storyRoomId={id} />)}
            {archivedList.length === 0 ? <p>No archived material.</p> : null}
          </div>
        </details>
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
          {memoryCardList.length === 0 && <p>No Memory Cards yet. Use draft suggestions from accepted contributions first.</p>}
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
          {storyMapList.length === 0 && <p>No Story Maps yet. Create at least one Memory Card, then generate the first map.</p>}
        </div>
      </section>

      <section className="card">
        <h2>Create Story Map manually</h2>
        <p>The Story Map is not the final product. It is the production blueprint for the Capsule Builder.</p>
        <form action={createStoryMap} className="stack">
          <input type="hidden" name="story_room_id" value={id} />
          <label>Story focus<input name="story_focus" placeholder="Parent story / recipe tradition / family home / milestone" /></label>
          <label>Main themes<textarea name="themes" placeholder="Family, food, marriage, childhood, work, holiday tradition, remembrance..." /></label>
          <label>Open questions<textarea name="open_questions" placeholder="What should we ask in the interview before production?" /></label>
          <label>Interview plan<textarea name="interview_plan" placeholder="Warm-up, timeline, object/photo prompts, memory prompts, confirmation questions, closing reflection..." /></label>
          <label>Recommended output<textarea name="recommended_output" placeholder="Signature Story Capsule with edited story sections, quotes, captions, voice excerpts, and printable keepsake." /></label>
          <button type="submit">Create Story Map</button>
        </form>
      </section>

      <section className="card">
        <h2>Manual Story Capsule record</h2>
        <p>Use this only when you need to create a simple delivery record manually. The preferred path is the Capsule Builder near the top.</p>
        <form action={createStoryCapsulePlaceholder} className="stack">
          <input type="hidden" name="story_room_id" value={id} />
          <label>Capsule title<input name="title" placeholder="Grandma's Sunday Dinner" /></label>
          <label>Capsule category
            <select name="category_key" defaultValue="parent-grandparent">
              {categories.map((category) => (
                <option key={category.value} value={category.value}>{category.label}</option>
              ))}
            </select>
          </label>
          <label>Web slug<input name="web_slug" placeholder="grandmas-sunday-dinner" /></label>
          <label>Included assets<textarea name="included_assets" placeholder="Draft sections, selected quotes, photo captions, voice excerpt placeholders, printable keepsake..." /></label>
          <label>Delivery note<textarea name="delivery_note" placeholder="Private draft delivery note for this capsule." /></label>
          <button type="submit">Create manual Capsule record</button>
        </form>
      </section>
    </main>
  );
}
