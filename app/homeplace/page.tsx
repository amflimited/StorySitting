import { createHomeplaceStoryRoom } from "./server-actions";

export default function HomeplaceIntakePage() {
  return (
    <main className="shell stack">
      <section className="card stack">
        <p className="kicker">Homeplace Story Map</p>
        <h1>Start a Story Map before the place changes hands.</h1>
        <p>Use this intake when the story is tied to a family home, farm, business, kitchen, room, vehicle, land, or meaningful place.</p>
      </section>

      <section className="grid">
        <div className="card stack">
          <h2>Best fit</h2>
          <ul className="action-list">
            <li>Family home sale or cleanout</li>
            <li>Parent moving or downsizing</li>
            <li>Farm, shop, or family business transition</li>
            <li>Recipes, objects, rooms, vehicles, or land with stories attached</li>
          </ul>
        </div>
        <div className="card stack">
          <h2>What happens next</h2>
          <ul className="action-list">
            <li>Open a private Story Room</li>
            <li>Invite family contributors</li>
            <li>Gather memories, photos, questions, and voice notes</li>
            <li>StorySitting turns the material into a Story Map</li>
          </ul>
        </div>
      </section>

      <section className="card">
        <form action={createHomeplaceStoryRoom} className="stack">
          <p className="kicker">Intake</p>
          <h2>Tell us what place is changing.</h2>

          <label>Project title
            <input name="title" required placeholder="The Miller Family Farm Before It Sold" />
          </label>

          <label>Who or what is the story centered around?
            <input name="subject_name" placeholder="Grandpa, Mom, the farmhouse, the family kitchen, the old shop..." />
          </label>

          <label>What kind of place is this?
            <select name="place_type">
              <option value="family_home">Family home</option>
              <option value="farm">Farm / land</option>
              <option value="business">Family business / shop</option>
              <option value="kitchen_table">Kitchen / recipe tradition</option>
              <option value="vehicle_or_tool">Vehicle / tool / object story</option>
              <option value="other_place">Other meaningful place</option>
            </select>
          </label>

          <label>Why now?
            <textarea name="why_now" required placeholder="The house is being sold, Dad is moving, the farm is changing hands, the family is gathering soon..." />
          </label>

          <label>What should not be forgotten?
            <textarea name="not_forgotten" placeholder="Stories, rooms, people, recipes, tools, vehicles, habits, sayings, objects, traditions..." />
          </label>

          <label>Known materials
            <textarea name="known_materials" placeholder="Photos, recipe cards, documents, old letters, voice recordings, home videos, tools, vehicles, furniture..." />
          </label>

          <label>Who should contribute?
            <textarea name="contributors_to_invite" placeholder="Siblings, parents, grandchildren, cousins, neighbors, family friends..." />
          </label>

          <label>What questions does the family still need answered?
            <textarea name="family_questions" placeholder="Who built this? Why did they move here? What happened in this room? Where did this recipe come from?" />
          </label>

          <input type="hidden" name="package_tier" value="signature" />
          <button type="submit">Create Homeplace Story Room</button>
        </form>
      </section>
    </main>
  );
}
