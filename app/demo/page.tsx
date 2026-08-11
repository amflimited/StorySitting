import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { IllustrativePlayer } from "@/components/IllustrativePlayer";

export const metadata: Metadata = {
  title: "Story Shelf app preview",
  description: "See how a family follows permission, receives a Story Drop, checks the source, and asks the next question."
};

const statusItems = [
  ["done", "$5 Story Start", "Mara opened the project"],
  ["done", "Permission", "Ray authorized the sitting"],
  ["done", "Story Edition kept", "$79 · 31 minutes recorded"],
  ["current", "Story Drop", "Ready to hear now"],
  ["", "Source review", "Names and dates being checked"],
  ["", "On the shelf", "Portable family delivery"]
];

export default function DemoPage() {
  return (
    <main className="demo-page">
      <section className="demo-hero">
        <span className="overline"><i /> Interactive product preview</span>
        <h1>Welcome to the Story Shelf.</h1>
        <p>The grandparent never needs this app. This is where the family follows the sitting, hears the first moment, checks the source, and decides what to ask next.</p>
      </section>

      <div className="demo-frame">
        <aside className="demo-sidebar">
          <BrandMark compact />
          <div className="demo-project"><span>Current storyteller</span><strong>Grandpa Ray</strong><small>4 stories on the shelf</small></div>
          <nav className="demo-menu"><a className="active" href="#story"><span>01</span>Story Shelf</a><a href="#status"><span>02</span>Progress</a><a href="#threads"><span>03</span>Story Threads</a><a href="#questions"><span>04</span>Questions</a><a href="#family"><span>05</span>Family</a></nav>
          <div className="demo-sidebar-note">Illustrative product demo. Ray and the story shown here are fictional; no customer material is public.</div>
        </aside>

        <section className="demo-main" id="story">
          <div className="demo-topbar"><div><span>Tuesday, August 11</span><h2>Good morning, Mara.</h2></div><div className="demo-badge">Story Drop ready</div></div>
          <div className="demo-grid">
            <article className="demo-card demo-story-card">
              <div className="demo-story-cover"><span>Story Drop 01 · Grandpa Ray</span><h3>The Three Slices of Cherry Pie</h3><p>Henry County Fair · 1964 · 5 source moments</p></div>
              <IllustrativePlayer />
              <div className="demo-chapter">
                <span>Chapter one · preview</span>
                <h3>He was not there for the livestock.</h3>
                <p>She was working the pie table for her church. Lorraine. She had a little tin cash box and she wouldn’t make change until you said please.</p>
                <p>I bought a slice of cherry pie I did not want. Then I bought another one. By the third slice she looked at me over the top of that cash box and said, <em>you don’t even like cherry.</em></p>
                <div className="demo-source-link">↗ Compare chapter to source audio</div>
              </div>
            </article>

            <div className="demo-stack">
              <section className="demo-card demo-panel" id="status"><div className="demo-panel-head"><h3>Where it stands</h3><span>4 of 6</span></div><div className="status-list">{statusItems.map(([state, title, detail]) => <div className={state} key={title}><i /><span><strong>{title}</strong><small>{detail}</small></span></div>)}</div></section>
              <section className="demo-card demo-panel" id="threads"><div className="demo-panel-head"><h3>Threads from this call</h3><span>7 found</span></div><div className="thread-chips"><span>Lorraine</span><span>4-H Fair</span><span>Pie table</span><span>Church</span><span>First date</span><span>1964</span><span>Marriage</span></div></section>
              <section className="demo-card demo-panel" id="questions"><div className="demo-panel-head"><h3>Ask next</h3><span>Family queue</span></div><div className="question-card"><p>“What did Lorraine say when you finally proposed?”</p><small>3 relatives voted · ready for next sitting</small></div><div className="question-card"><p>“Who else was with you at the fair that night?”</p><small>Added by Daniel · needs context</small></div></section>
            </div>
          </div>
          <p className="demo-disclaimer">The narrated sample uses a device voice for demonstration—not a cloned storyteller voice.</p>
        </section>
      </div>

      <section className="final-cta-section" style={{ paddingTop: 0 }}>
        <div className="final-cta-inner" style={{ minHeight: 500 }}>
          <span className="overline light"><i /> Make a real shelf</span>
          <h2>Start with one voice.</h2>
          <p>The storyteller uses a normal phone. You get the clarity, proof, and family experience of the app.</p>
          <Link href="/start" className="button button-light button-large">Start a Story Start <span>$5 →</span></Link>
        </div>
      </section>
    </main>
  );
}
