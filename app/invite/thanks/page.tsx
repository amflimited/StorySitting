import Link from "next/link";

export default function InviteThanksPage() {
  return (
    <main className="shell stack">
      <section className="card stack">
        <p className="kicker">Contribution received</p>
        <h1>Thank you. Your contribution was submitted.</h1>
        <p>
          Your memory, note, question, recipe, photo description, or uploaded material is now inside the private Story Room review queue.
        </p>

        <div className="actions">
          <Link className="btn" href="/">Return to app</Link>
        </div>
      </section>

      <section className="grid">
        <div className="card stack">
          <p className="kicker">What StorySitting does next</p>
          <h2>Review and organization</h2>
          <p>Contributions are reviewed, normalized, grouped into themes, and prepared for Story Map and interview development.</p>
        </div>

        <div className="card stack">
          <p className="kicker">Why multiple submissions matter</p>
          <h2>One memory unlocks another</h2>
          <p>Family stories usually emerge through accumulation. Small details, recipes, objects, rooms, vehicles, and side memories often become the strongest parts of the finished Story Capsule.</p>
        </div>
      </section>
    </main>
  );
}
