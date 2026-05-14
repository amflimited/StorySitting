import { createStoryRoom } from "./server-actions";
import { getProductVisual } from "@/lib/product-visuals";

export default function NewStoryRoomPage() {
  const visual = getProductVisual("start-with-one-memory");

  return (
    <main className="shell stack">
      <section className="card stack">
        <div className="between">
          <div style={{ maxWidth: 620 }}>
            <p className="kicker">New Story Room</p>
            <h1>Start with one memory.</h1>
            <p>
              You do not need the whole family archive organized. Create one private room around the person,
              recipe, place, milestone, or question your family would regret losing.
            </p>
          </div>
          {visual && (
            <div className="product-hero-image" style={{ width: 360, maxWidth: "100%" }}>
              <img src={visual.src} alt={visual.title} />
            </div>
          )}
        </div>
      </section>

      <div className="grid">
        <section className="card">
          <p className="kicker">Create the room</p>
          <h2>Create a private Story Room</h2>
          <form action={createStoryRoom} className="stack">
            <label>Room title<input name="title" required placeholder="Grandma's Sunday Dinner" /></label>
            <label>Subject name<input name="subject_name" placeholder="Mom, Grandpa, Nana, the anniversary, the old house..." /></label>
            <label>Package tier
              <select name="package_tier">
                <option value="focused">Focused Story Capsule</option>
                <option value="signature">Signature Story Capsule</option>
                <option value="premium">Premium Family Keepsake</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            <label>Why now?<textarea name="why_now" placeholder="Before a birthday, before a move, before the recipe is lost, before the family home changes hands..." /></label>
            <label>Known materials<textarea name="known_materials" placeholder="Photos, recipes, letters, voice recordings, documents, objects, old notes, family questions..." /></label>
            <button type="submit">Create Story Room</button>
          </form>
        </section>

        <aside className="card stack">
          <p className="kicker">End product target</p>
          <h2>The room should lead to something finished.</h2>
          <p>
            A Story Room exists to gather the material for a real Story Capsule: voice clips, story sections,
            quote cards, family photos, a private Capsule page, and eventually the keepsake package.
          </p>
          <div className="mini-card">
            <strong>Best first input</strong>
            <p>One memory, one photo, one recipe card, one voice note, one object, or one question.</p>
          </div>
          <div className="mini-card">
            <strong>Best next outcome</strong>
            <p>A Story Map that shows what the finished Capsule can become.</p>
          </div>
        </aside>
      </div>
    </main>
  );
}
