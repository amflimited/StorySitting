import Link from "next/link";

export default function HomePage() {
  return (
    <main className="shell stack">
      <section className="card stack">
        <p className="kicker">StorySitting production app</p>
        <h1>Build Story Capsules before the stories disappear with the place.</h1>
        <p>
          StorySitting helps families gather memories, photos, questions, recipes, objects,
          documents, and voice notes into a guided Story Map and finished Story Capsule.
        </p>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 24 }}>
          <Link className="btn" href="/homeplace">Start a Homeplace Story Map</Link>
          <Link className="btn secondary" href="/signup">Sign up</Link>
          <Link className="btn secondary" href="/login">Log in</Link>
        </div>
      </section>

      <section className="grid">
        <div className="card stack">
          <p className="kicker">Current wedge</p>
          <h2>Homeplace transitions</h2>
          <p>Family homes, farms, kitchens, shops, recipes, vehicles, land, and meaningful places before they change hands.</p>
        </div>

        <div className="card stack">
          <p className="kicker">Operational path</p>
          <h2>Room → Map → Session → Capsule</h2>
          <p>The app is now focused on turning scattered family input into a finished, private Story Capsule.</p>
        </div>
      </section>
    </main>
  );
}
