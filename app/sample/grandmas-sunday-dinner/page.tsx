import Link from "next/link";

const chapters = [
  {
    title: "The house smelled like Sunday dinner",
    body: "Before anyone reached the table, the house already felt like family. The meal, the kitchen, and the familiar voices became part of the tradition."
  },
  {
    title: "The recipe lived in her hands",
    body: "The written card could list ingredients, but it could not fully explain judgment, timing, texture, or the small details learned over years."
  },
  {
    title: "There was always room",
    body: "The table was crowded, but people felt welcome. The story was not only about food. It was about belonging."
  }
];

export default function GrandmasSundayDinnerSamplePage() {
  return (
    <main className="shell stack">
      <section className="card stack">
        <p className="kicker">Sample Story Capsule</p>
        <h1>Grandma’s Sunday Dinner</h1>
        <p>A sample showing how a family recipe, a few memories, and scattered details can become a private Story Capsule.</p>
        <div className="page-actions">
          <Link className="btn" href="/start">Start your Capsule online</Link>
          <Link className="btn secondary" href="/capsules/favorite-meals">View this Capsule type</Link>
        </div>
      </section>

      <section className="grid">
        <article className="card stack">
          <p className="kicker">Raw material</p>
          <h2>One memory, recipe, photo, or question</h2>
          <p>The family starts with imperfect pieces: a recipe card, a kitchen memory, a photo, a voice note, or a detail someone keeps repeating.</p>
        </article>
        <article className="card stack">
          <p className="kicker">StorySitting turns it into</p>
          <h2>Memory Cards, a Story Map, and a draft Capsule</h2>
          <p>The system organizes the material into themes, sections, pull quotes, follow-up questions, and a family-facing preview.</p>
        </article>
      </section>

      <section className="card stack">
        <p className="kicker">Draft preview</p>
        <h2>What the Capsule starts to become</h2>
        <div className="stack">
          {chapters.map((chapter, index) => (
            <article className="mini-card" key={chapter.title}>
              <span className="badge strong">Chapter {index + 1}</span>
              <h3>{chapter.title}</h3>
              <p>{chapter.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid">
        <div className="card stack">
          <p className="kicker">Family contributes</p>
          <ul className="action-list">
            <li>Recipe memories</li>
            <li>Photos or object notes</li>
            <li>Short stories from relatives</li>
            <li>Questions the family still wants answered</li>
          </ul>
        </div>
        <div className="card stack">
          <p className="kicker">StorySitting builds</p>
          <ul className="action-list">
            <li>Story Map</li>
            <li>Memory Cards</li>
            <li>Draft Capsule preview</li>
            <li>Interview prompts</li>
            <li>Edited sections and caption ideas</li>
          </ul>
        </div>
      </section>

      <section className="card stack">
        <p className="kicker">No-call path</p>
        <h2>Start with one memory. We help shape the rest.</h2>
        <p>You do not need to organize everything first. Start online with one story, photo, recipe, or question.</p>
        <div className="page-actions">
          <Link className="btn" href="/start">Start your Capsule online</Link>
          <Link className="btn secondary" href="/privacy-and-family-material">Privacy and family material</Link>
        </div>
      </section>
    </main>
  );
}
