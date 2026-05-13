import Link from "next/link";
import { requireUser } from "@/lib/auth";

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
  if (typeof value !== "string") return [];
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function textValue(value: unknown) {
  return typeof value === "string" ? value : "";
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
  const data = (capsule.capsule_data ?? {}) as Record<string, unknown>;
  const title = textValue(data.title) || storyRoom?.title || "Story Capsule";
  const deliveryNote = textValue(data.delivery_note);
  const includedAssets = splitLines(data.included_assets);
  const roomTitle = storyRoom?.title ?? "Story Room";
  const subject = storyRoom?.subject_name ?? "";

  return (
    <main className="shell stack">
      <section className="card stack">
        <div className="between">
          <div>
            <p className="kicker">Private Story Capsule</p>
            <h1>{title}</h1>
            <p>{subject || roomTitle}</p>
          </div>
          <span className="badge strong">{statusLabel(capsule.status)}</span>
        </div>

        <div className="capsule-hero-note">
          <p>{deliveryNote || "This is the private delivery home for your Story Capsule. Final files, notes, and keepsake materials will appear here as the project is prepared."}</p>
        </div>

        <div className="metrics-grid">
          <div><strong>{statusLabel(storyRoom?.production_status)}</strong><span>Room status</span></div>
          <div><strong>{capsule.delivered_at ? "Delivered" : "Draft"}</strong><span>Delivery state</span></div>
          <div><strong>{includedAssets.length}</strong><span>Listed assets</span></div>
          <div><strong>{new Date(capsule.created_at).toLocaleDateString()}</strong><span>Created</span></div>
        </div>
      </section>

      <section className="grid">
        <div className="card stack">
          <p className="kicker">Included material</p>
          <h2>What this Capsule contains</h2>
          {includedAssets.length > 0 ? (
            <ul className="action-list">
              {includedAssets.map((asset) => <li key={asset}>{asset}</li>)}
            </ul>
          ) : (
            <p>No final asset list has been added yet. Staff can add expected deliverables from the production room.</p>
          )}
        </div>

        <div className="card stack">
          <p className="kicker">What happens here</p>
          <h2>Capsule delivery path</h2>
          <ul className="action-list">
            <li>StorySitting organizes the strongest memories, quotes, captions, and voice moments.</li>
            <li>Final files and delivery notes are attached to this private Capsule record.</li>
            <li>Your family can use this page as the central place to return to the finished project.</li>
          </ul>
        </div>
      </section>

      <section className="card stack">
        <p className="kicker">Capsule sections</p>
        <h2>Draft structure</h2>
        <div className="steps">
          <article><span>01</span><h3>Story sections</h3><p>Edited readable moments built from the Story Room, interview, and Memory Cards.</p></article>
          <article><span>02</span><h3>Quotes</h3><p>Lines worth saving for cards, captions, books, and family keepsakes.</p></article>
          <article><span>03</span><h3>Photos and captions</h3><p>People, places, objects, recipes, rooms, tools, and traditions explained in context.</p></article>
          <article><span>04</span><h3>Voice excerpts</h3><p>Selected audio moments when the voice matters more than the transcript.</p></article>
        </div>
      </section>

      <section className="card stack">
        <p className="kicker">Private by default</p>
        <h2>This page is for the family project.</h2>
        <p>StorySitting does not publish identifiable family material publicly without permission. This page is intended as the private delivery surface for the Story Capsule.</p>
        <div className="actions">
          <Link className="btn" href={`/story-rooms/${capsule.story_room_id}`}>Open Story Room</Link>
          <Link className="btn secondary" href="/dashboard">Back to dashboard</Link>
        </div>
      </section>
    </main>
  );
}
