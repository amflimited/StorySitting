import Link from "next/link";
import { WorkflowGuide } from "@/components/WorkflowGuide";

export default function InviteThanksPage() {
  return (
    <main className="shell stack">
      <WorkflowGuide
        role="contributor"
        status="gathering_contributions"
        title="Contribution complete"
        justHappened="Your contribution was added to the family Story Room review queue. Staff and the family organizer can now use it to build Memory Cards, interview prompts, and the Story Map."
      />

      <section className="card stack">
        <p className="kicker">Contribution received</p>
        <h1>Thank you. Your contribution was submitted.</h1>
        <p>
          Your memory, note, question, recipe, photo description, or uploaded material is now part of the active Story Capsule process.
        </p>

        <div className="mini-card">
          <strong>Most useful next move</strong>
          <p>
            Add one more detail: a name, location, object, recipe, room, quote, vehicle, family saying, or follow-up question. The strongest Capsules usually come from multiple small submissions.
          </p>
        </div>

        <div className="actions">
          <Link className="btn" href="/">Return to app</Link>
        </div>
      </section>

      <section className="grid">
        <div className="card stack">
          <p className="kicker">What StorySitting does next</p>
          <h2>Review and organization</h2>
          <p>
            Contributions are reviewed, grouped into themes, converted into Memory Cards, and prepared for Story Map and interview development.
          </p>
        </div>

        <div className="card stack">
          <p className="kicker">Why small details matter</p>
          <h2>One memory unlocks another</h2>
          <p>
            Family stories usually emerge through accumulation. Recipes, tools, rooms, phrases, vehicles, habits, and side memories often become the emotional center of the finished Story Capsule.
          </p>
        </div>
      </section>
    </main>
  );
}
