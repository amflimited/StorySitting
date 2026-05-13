import Link from "next/link";
import { requireUser } from "@/lib/auth";

function statusLabel(value: string | null | undefined) {
  return value ? value.replaceAll("_", " ") : "unknown";
}

function capsuleTitle(capsule: any) {
  return capsule.capsule_data?.title || capsule.story_rooms?.title || capsule.web_slug || "Untitled Story Capsule";
}

export default async function StoryCapsulesIndexPage() {
  const { supabase } = await requireUser();

  const { data: capsules, error } = await supabase
    .from("story_capsules")
    .select("id,status,web_slug,capsule_data,created_at,delivered_at,story_room_id,story_rooms(id,title,subject_name,production_status)")
    .order("created_at", { ascending: false });

  return (
    <main className="shell stack">
      <section className="card stack">
        <div className="between">
          <div>
            <p className="kicker">Story Capsules</p>
            <h1>Capsule delivery hub</h1>
            <p>This page lists Story Capsule records your account can access. A Capsule must be created from the staff production room before it appears here.</p>
          </div>
          <Link className="btn secondary" href="/dashboard">Back to dashboard</Link>
        </div>
      </section>

      {error && (
        <section className="card stack">
          <h2>Could not load capsules</h2>
          <p>{error.message}</p>
          <p>This usually means Supabase RLS does not yet allow your account to read Story Capsule records.</p>
        </section>
      )}

      {!error && (!capsules || capsules.length === 0) && (
        <section className="card stack">
          <p className="kicker">No capsules yet</p>
          <h2>No Story Capsule records found.</h2>
          <p>Create one from Staff → Story Room → Story Capsule delivery placeholder. After it has a web slug, it will show here.</p>
          <div className="actions">
            <Link className="btn" href="/staff">Open staff console</Link>
            <Link className="btn secondary" href="/dashboard">Open dashboard</Link>
          </div>
        </section>
      )}

      {!error && capsules && capsules.length > 0 && (
        <section className="grid">
          {capsules.map((capsule: any) => (
            <article key={capsule.id} className="card stack">
              <div>
                <span className="badge strong">{statusLabel(capsule.status)}</span>
                <h2>{capsuleTitle(capsule)}</h2>
                <p>{capsule.story_rooms?.subject_name || capsule.story_rooms?.title || "StorySitting project"}</p>
              </div>
              <div className="metrics-grid">
                <div><strong>{statusLabel(capsule.story_rooms?.production_status)}</strong><span>Room status</span></div>
                <div><strong>{capsule.delivered_at ? "Delivered" : "Draft"}</strong><span>Delivery</span></div>
                <div><strong>{new Date(capsule.created_at).toLocaleDateString()}</strong><span>Created</span></div>
              </div>
              <div className="actions">
                {capsule.web_slug ? (
                  <Link className="btn" href={`/story-capsules/${capsule.web_slug}`}>Open Capsule</Link>
                ) : (
                  <span className="badge">No slug yet</span>
                )}
                <Link className="btn secondary" href={`/story-rooms/${capsule.story_room_id}`}>Open Story Room</Link>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
