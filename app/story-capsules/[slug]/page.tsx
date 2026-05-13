import Link from "next/link";
import { requireUser } from "@/lib/auth";
import {
  DELIVERABLE_VISIBILITY,
  buildCapsuleReadiness,
  buildInterviewPrep,
  buildLiveNarrativePreview,
  toList
} from "@/lib/capsule-intelligence";

type JoinedStoryRoom = {
  id?: string | null;
  title?: string | null;
  subject_name?: string | null;
  production_status?: string | null;
};

function firstRelatedRoom(value: JoinedStoryRoom | JoinedStoryRoom[] | null | undefined): JoinedStoryRoom | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function statusLabel(value: string | null | undefined) {
  return value ? value.replaceAll("_", " ") : "unknown";
}

function splitLines(value: unknown) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value !== "string") return [];
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function textValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

export default async function StoryCapsulePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { supabase } = await requireUser();

  const { data: capsule, error } = await supabase
    .from("story_capsules")
    .select("id,status,web_slug,capsule_data,delivered_at,created_at,story_room_id,story_rooms(id,title,subject_name,production_status)")
    .eq("web_slug", slug)
    .single();

  if (error || !capsule) {
    return (
      <main className="shell">
        <section className="card stack">
          <p className="kicker">Story Capsule</p>
          <h1>Capsule not found</h1>
          <p>This Story Capsule either does not exist, has not been shared yet, or your account does not have access to it.</p>
          <Link className="btn secondary" href="/dashboard">Back to dashboard</Link>
        </section>
      </main>
    );
  }

  const storyRoom = firstRelatedRoom(capsule.story_rooms as JoinedStoryRoom | JoinedStoryRoom[] | null | undefined);
  const data = asRecord(capsule.capsule_data);
  const title = textValue(data.title) || storyRoom?.title || "Story Capsule";
  const deliveryNote = textValue(data.delivery_note);
  const categoryLabel = textValue(data.category_label) || "Signature Story Capsule";
  const promise = textValue(data.plain_language_promise);
  const storyFocus = textValue(data.story_focus) || title;
  const includedAssets = splitLines(data.included_assets);
  const roomTitle = storyRoom?.title ?? "Story Room";
  const subject = storyRoom?.subject_name ?? "";
  const chapters = buildLiveNarrativePreview({ capsuleData: data, memoryCards: [] });
  const readiness = buildCapsuleReadiness({ capsuleData: data, capsules: [capsule] });
  const interviewPrep = buildInterviewPrep({ capsuleData: data });
  const themes = toList(data.themes);
  const people = toList(data.people);
  const places = toList(data.places);
  const strongestQuotes = toList(data.strongest_quotes);
  const productionNextSteps = toList(data.production_next_steps);

  return (
    <main className="shell stack">
      <section className="card stack">
        <div className="between">
          <div>
            <p className="kicker">Private Story Capsule Preview</p>
            <h1>{title}</h1>
            <p>{promise || subject || roomTitle}</p>
          </div>
          <div className="stack" style={{ minWidth: 220 }}>
            <span className="badge strong">{categoryLabel}</span>
            <span className="badge">{statusLabel(capsule.status)}</span>
          </div>
        </div>

        <div className="capsule-hero-note">
          <p>{deliveryNote || "This is the private preview for what your Story Capsule is becoming: story sections, quotes, themes, prompts, and future keepsake materials."}</p>
        </div>

        <div className="metrics-grid">
          <div><strong>{readiness.score}%</strong><span>Capsule readiness</span></div>
          <div><strong>{readiness.label}</strong><span>Current state</span></div>
          <div><strong>{chapters.length}</strong><span>Draft chapters</span></div>
          <div><strong>{strongestQuotes.length}</strong><span>Pull quotes</span></div>
          <div><strong>{includedAssets.length}</strong><span>Planned assets</span></div>
          <div><strong>{readiness.estimatedRemaining}</strong><span>Estimated remaining</span></div>
        </div>
      </section>

      <section className="card stack">
        <p className="kicker">What this is becoming</p>
        <h2>Live narrative preview</h2>
        <p>This is the bridge from Story Map to final deliverable. It shows how raw memories are starting to become readable Capsule sections.</p>
        <div className="stack">
          {chapters.length > 0 ? chapters.map((chapter) => (
            <article key={`${chapter.chapterNumber}-${chapter.title}`} className="mini-card stack">
              <div className="between">
                <span className="badge strong">Chapter {chapter.chapterNumber}</span>
                {chapter.themes.length ? <span className="badge">{chapter.themes.slice(0, 3).join(" · ")}</span> : null}
              </div>
              <h3>{chapter.title}</h3>
              <p>{chapter.excerpt}</p>
              {chapter.quotes.length ? <p><em>“{chapter.quotes[0]}”</em></p> : null}
              <p><strong>Linked memories:</strong> {chapter.linkedMemories.length ? chapter.linkedMemories.join(", ") : "Staff will connect source memories during editing."}</p>
              <p><strong>Suggested media:</strong> {chapter.suggestedMedia.join(", ")}</p>
            </article>
          )) : (
            <p>No chapter preview exists yet. Staff should build a Capsule draft from the Story Map first.</p>
          )}
        </div>
      </section>

      <section className="grid">
        <div className="card stack">
          <p className="kicker">Story threads</p>
          <h2>{storyFocus}</h2>
          <p>These are the pieces currently shaping the Capsule.</p>
          <ul className="action-list">
            {themes.slice(0, 8).map((theme) => <li key={theme}>{theme}</li>)}
            {!themes.length ? <li>Staff will add themes during the Story Map and editing pass.</li> : null}
          </ul>
        </div>

        <div className="card stack">
          <p className="kicker">People and places</p>
          <h2>Who and where this touches</h2>
          <p><strong>People:</strong> {people.length ? people.join(", ") : "Names still need confirmation."}</p>
          <p><strong>Places:</strong> {places.length ? places.join(", ") : "Place details still need to be added."}</p>
        </div>
      </section>

      <section className="card stack">
        <p className="kicker">What you receive</p>
        <h2>Deliverable visibility</h2>
        <p>The final Capsule is more than a form submission. It becomes a set of finished family materials.</p>
        <div className="grid">
          {DELIVERABLE_VISIBILITY.map((item) => (
            <div className="mini-card" key={item.title}>
              <strong>{item.title}</strong>
              <p>{item.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid">
        <div className="card stack">
          <p className="kicker">Included material</p>
          <h2>Planned assets</h2>
          {includedAssets.length > 0 ? (
            <ul className="action-list">
              {includedAssets.map((asset) => <li key={asset}>{asset}</li>)}
            </ul>
          ) : (
            <p>No final asset list has been added yet.</p>
          )}
        </div>

        <div className="card stack">
          <p className="kicker">Strong lines</p>
          <h2>Pull quotes</h2>
          {strongestQuotes.length > 0 ? (
            <ul className="action-list">
              {strongestQuotes.slice(0, 8).map((quote) => <li key={quote}>“{quote}”</li>)}
            </ul>
          ) : (
            <p>No pull quotes selected yet. Ask for one memory in the contributor’s own words.</p>
          )}
        </div>
      </section>

      <section className="card stack">
        <p className="kicker">Interview prep</p>
        <h2>The next conversation</h2>
        <p>{interviewPrep.opening}</p>
        <ul className="action-list">
          {interviewPrep.prompts.slice(0, 8).map((prompt) => <li key={prompt}>{prompt}</li>)}
        </ul>
        <p><strong>Close with:</strong> {interviewPrep.closing}</p>
      </section>

      <section className="card stack">
        <p className="kicker">Next steps</p>
        <h2>{readiness.nextAction}</h2>
        {productionNextSteps.length > 0 ? (
          <ul className="action-list">
            {productionNextSteps.map((step) => <li key={step}>{step}</li>)}
          </ul>
        ) : (
          <p>Staff will use the Story Map and Memory Cards to edit this draft into a final Capsule.</p>
        )}
        <div className="actions">
          <Link className="btn" href={`/story-rooms/${capsule.story_room_id}`}>Open Story Room</Link>
          <Link className="btn secondary" href="/dashboard">Back to dashboard</Link>
        </div>
      </section>
    </main>
  );
}
