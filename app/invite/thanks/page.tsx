import Link from "next/link";

export default function InviteThanksPage() {
  return (
    <main className="shell story-detail-page">
      <section className="shelf-heading">
        <div>
          <p className="kicker">Family relay received</p>
          <h1>That detail can change the next question.</h1>
          <p>
            Your memory, photograph, note, or question is now in the private family source
            material. The StorySitting team will review it before it reaches an interview or
            finished chapter.
          </p>
        </div>
        <span className="success-seal" aria-hidden="true">✓</span>
      </section>

      <section className="story-tools-grid">
        <article className="story-tool-card">
          <div className="tool-card-head">
            <span className="tool-icon">01</span>
            <div><p className="kicker">What happens now</p><h3>A person checks it.</h3></div>
          </div>
          <p>
            We keep family additions separate from the storyteller&apos;s own words, then use the
            useful detail as context, a source attachment, or a candidate follow-up question.
          </p>
        </article>
        <article className="story-tool-card">
          <div className="tool-card-head">
            <span className="tool-icon">02</span>
            <div><p className="kicker">What stays private</p><h3>The rest of the shelf.</h3></div>
          </div>
          <p>
            A contribution link accepts one family relay. It does not unlock recordings,
            chapters, permission choices, or other relatives&apos; material.
          </p>
        </article>
        <article className="story-tool-card">
          <div className="tool-card-head">
            <span className="tool-icon">03</span>
            <div><p className="kicker">One more useful thing</p><h3>Send it to the organizer.</h3></div>
          </div>
          <p>
            If another family member has the missing name, date, photograph, or backstory, ask
            the organizer for a fresh private link made specifically for them.
          </p>
        </article>
      </section>

      <div className="page-actions" style={{ justifyContent: "center", marginTop: 32 }}>
        <Link className="btn" href="/">See how StorySitting works</Link>
        <Link className="btn secondary" href="/demo">Preview a finished Story Drop</Link>
      </div>
    </main>
  );
}
