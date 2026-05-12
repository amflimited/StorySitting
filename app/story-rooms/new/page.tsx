import { createStoryRoom } from "./server-actions";

export default function NewStoryRoomPage() {
  return (
    <main className="shell">
      <div className="card">
        <p className="kicker">New Story Room</p>
        <h1>Create a private Story Room</h1>
        <form action={createStoryRoom} className="stack">
          <label>Room title<input name="title" required placeholder="Mary Ellen's Kitchen Table" /></label>
          <label>Subject name<input name="subject_name" placeholder="Mom, Grandpa, the family farm..." /></label>
          <label>Package tier
            <select name="package_tier">
              <option value="focused">Focused Story Capsule</option>
              <option value="signature">Signature Story Capsule</option>
              <option value="premium">Premium Family Keepsake</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          <label>Why now?<textarea name="why_now" placeholder="Before the house is sold, before a birthday, before a move..." /></label>
          <label>Known materials<textarea name="known_materials" placeholder="Photos, recipes, letters, voice recordings, documents..." /></label>
          <button type="submit">Create Story Room</button>
        </form>
      </div>
    </main>
  );
}
