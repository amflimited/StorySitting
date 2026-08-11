import Image from "next/image";
import Link from "next/link";
import { ProductPhone } from "@/components/ProductPhone";
import { StoryWave } from "@/components/StoryWave";

const features = [
  {
    number: "01",
    title: "Permission you can see",
    text: "You can fund the gift. They still control contact, recording, editing, and sharing—scope by scope, story by story."
  },
  {
    number: "02",
    title: "Every line has a source",
    text: "Move from polished chapter to verbatim transcript to the exact audio moment. We tighten and order; we do not invent."
  },
  {
    number: "03",
    title: "One call finds the next story",
    text: "People, places, objects, eras, and loose ends become Story Threads the family can turn into the next good question."
  },
  {
    number: "04",
    title: "A service that finishes",
    text: "No year of prompts and no new app for Grandma. StorySitting schedules, listens, writes, checks, and delivers."
  }
];

const steps = [
  { time: "2 min", who: "you", title: "Choose who to sit with", body: "Tell us who they are, the best way to ask, and three things your family would hate to forget." },
  { time: "$5", who: "start", title: "Open a trusted permission path", body: "Send a private Family Pass. A human independently verifies their response before any AI interview can be scheduled." },
  { time: "~30 min", who: "them", title: "They talk on any phone", body: "A disclosed AI interviewer listens patiently, asks useful follow-ups, and confirms recording consent out loud." },
  { time: "about a week", who: "us", title: "The story arrives finished", body: "Hear the original voice, read the polished chapter, inspect its sources, and keep a portable family copy." }
];

export default function HomePage() {
  return (
    <main className="marketing-page">
      <section className="home-hero">
        <div className="hero-copy">
          <span className="overline"><i /> Family stories, finally finished</span>
          <h1>They answer<br />the phone.<br /><em>You keep<br />the story.</em></h1>
          <p className="hero-lede">
            Give your mom, dad, or grandparent a patient listener—without asking them to learn an app.
            StorySitting turns one real phone conversation into chapters your family can hear, read, and keep.
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" href="/start">
              Start the first call <span>$5</span>
            </Link>
            <Link className="text-link" href="#proof">See the words become a chapter <b>↓</b></Link>
          </div>
          <div className="hero-trust">
            <span><i>✓</i> No app for them</span>
            <span><i>✓</i> Permission first</span>
            <span><i>✓</i> No subscription</span>
          </div>
        </div>

        <div className="hero-visual">
          <div className="hero-image-frame">
            <Image
              src="/images/story-call-hero.webp"
              alt="A grandmother enjoying a relaxed phone conversation at her kitchen table"
              fill
              priority
              sizes="(max-width: 900px) 100vw, 52vw"
            />
            <div className="image-grain" />
          </div>
          <div className="call-note call-note-top">
            <span className="live-dot" />
            <div><small>Story sitting</small><strong>31:08</strong></div>
            <StoryWave active compact />
          </div>
          <div className="call-note call-note-bottom">
            <span className="quote-mark">“</span>
            <p>By the third slice she knew I didn’t even like cherry.</p>
            <small>Story thread found · how they met</small>
          </div>
        </div>
      </section>

      <section className="promise-strip" aria-label="StorySitting price promise">
        <span><strong>$5</strong> starts permission</span>
        <i />
        <span><strong>$79</strong> only to keep the finished result</span>
        <i />
        <span><strong>$0</strong> recurring fees</span>
      </section>

      <section className="proof-section section-shell" id="proof">
        <div className="section-intro proof-intro">
          <span className="overline"><i /> The product, in plain sight</span>
          <h2>Not an AI summary.<br />A voice becoming a story.</h2>
          <p>The original is always there. Every meaningful edit can lead the family back to what was actually said.</p>
        </div>

        <div className="source-proof">
          <div className="proof-head">
            <div><span className="record-light" /><strong>Sitting 01</strong></div>
            <span>Ray, 84 · Henry County, Indiana</span>
            <span>Illustrative sample</span>
          </div>
          <div className="proof-grid">
            <div className="transcript-pane">
              <div className="pane-label"><span>Source audio + transcript</span><button type="button" aria-label="Illustrative play control">▶ 02:14</button></div>
              <div className="transcript-line"><time>02:14</time><p><b>Ray</b> At the fair. The 4-H fair. I wasn’t—well. I’ll be honest with you, I wasn’t there for the livestock.</p></div>
              <div className="transcript-line"><time>02:24</time><p><b>Ray</b> No. She was working the pie table. For her church. Lorraine.</p></div>
              <div className="transcript-line"><time>02:31</time><p><b>Ray</b> She had one of them little tin cash boxes. And she wouldn’t make you change until you said please.</p></div>
              <div className="transcript-line active"><time>02:39</time><p><b>Ray</b> So I bought a slice of cherry. Didn’t want it. Bought another one.</p></div>
              <div className="transcript-line"><time>02:46</time><p><b>Ray</b> Third slice she looks at me over the top of that box and she says, you don’t even like cherry.</p></div>
            </div>
            <div className="chapter-pane">
              <div className="pane-label"><span>Finished chapter</span><span>Source-linked</span></div>
              <span className="chapter-number">Chapter one</span>
              <h3>The Three Slices of Cherry Pie</h3>
              <p>She was working the pie table for her church. Lorraine. She had a little tin cash box and she wouldn’t make change until you said please.</p>
              <p>I bought a slice of cherry pie I did not want. Then I bought another one. By the third slice she looked at me over the top of that cash box and said, <em>you don’t even like cherry.</em></p>
              <div className="source-chip"><span>↗</span> 5 passages linked to Ray’s recording</div>
            </div>
          </div>
          <div className="proof-foot">
            <span>Same voice. Less wandering. Nothing invented.</span>
            <Link href="/demo">Open the interactive app preview →</Link>
          </div>
        </div>
      </section>

      <section className="how-section" id="how">
        <div className="section-shell">
          <div className="section-intro centered">
            <span className="overline light"><i /> How it works</span>
            <h2>Their phone is enough.</h2>
            <p>You run the gift from the app. They simply decide whether to answer, and whether to keep talking.</p>
          </div>
          <div className="process-grid">
            {steps.map((step, index) => (
              <article key={step.title}>
                <div className="process-marker"><span>{step.time}</span><small>{step.who}</small></div>
                <span className="process-number">0{index + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </article>
            ))}
          </div>
          <div className="permission-callout">
            <div className="permission-seal" aria-hidden="true"><span>✓</span><small>permission<br />on record</small></div>
            <div>
              <span className="overline light">A safer first hello</span>
              <h3>You can arrange the gift. Only they can authorize the story.</h3>
              <p>StorySitting separates a sponsor’s request from the storyteller’s consent. Contact, AI interviewing, recording, editing, and family sharing are visible decisions—not assumptions.</p>
            </div>
            <Link className="button button-light" href="/start">See the permission handshake</Link>
          </div>
        </div>
      </section>

      <section className="app-section section-shell">
        <div className="app-copy">
          <span className="overline"><i /> The family’s Story Shelf</span>
          <h2>The app starts getting good <em>after</em> the call.</h2>
          <p className="large-copy">This is not a remote control for an AI interviewer. It is where a family watches the story happen, hears the first moment, checks the facts, and finds the next question.</p>
          <div className="app-feature-list">
            <div><span>01</span><p><strong>Know where it stands</strong>Permission, scheduling, sitting, writing, review, and delivery—without bothering Grandpa for updates.</p></div>
            <div><span>02</span><p><strong>Hear the Story Drop</strong>The strongest 60–90 seconds arrive first, while the full chapter is being finished.</p></div>
            <div><span>03</span><p><strong>Follow Story Threads</strong>Tap a person, place, photograph, or unanswered detail and queue the next question.</p></div>
            <div><span>04</span><p><strong>Keep the source</strong>Download the original recording, transcript, approved chapter, and family files. No hostage archive.</p></div>
          </div>
          <Link href="/demo" className="button button-secondary">Walk through the app</Link>
        </div>
        <div className="phone-stage">
          <div className="orbit orbit-one" /><div className="orbit orbit-two" />
          <ProductPhone />
          <div className="floating-thread thread-one"><span>New thread</span><strong>Lorraine’s pie table</strong><small>Ask more next time →</small></div>
          <div className="floating-thread thread-two"><span>Family question</span><strong>“What did she say when you proposed?”</strong><small>3 relatives voted</small></div>
        </div>
      </section>

      <section className="difference-section">
        <div className="section-shell">
          <div className="section-intro split-intro">
            <div><span className="overline light"><i /> Why this is different</span><h2>Lots of tools can make text. We make a family record you can trust.</h2></div>
            <p>Phone calls, transcripts, and printed books are table stakes now. StorySitting is built around permission, provenance, and completion.</p>
          </div>
          <div className="difference-grid">
            {features.map((feature) => (
              <article key={feature.number}><span>{feature.number}</span><h3>{feature.title}</h3><p>{feature.text}</p></article>
            ))}
          </div>
        </div>
      </section>

      <section className="result-section section-shell">
        <div className="result-grid">
          <div className="result-image">
            <Image src="/images/finished-story.webp" alt="A finished keepsake chapter, audio waveform, and family photographs on a table" fill sizes="(max-width: 800px) 100vw, 50vw" />
          </div>
          <div className="result-copy">
            <span className="overline"><i /> What the family keeps</span>
            <h2>A story that survives the software.</h2>
            <p>Every finished sitting arrives as a portable family package—not only a link that disappears if a company does.</p>
            <ul className="result-list">
              <li><span>01</span><div><strong>Original voice recording</strong><small>The source, preserved and downloadable.</small></div></li>
              <li><span>02</span><div><strong>Verbatim transcript</strong><small>Searchable, timecoded, and left intact.</small></div></li>
              <li><span>03</span><div><strong>Polished chapters</strong><small>Readable prose that remains linked to what was said.</small></div></li>
              <li><span>04</span><div><strong>Story Threads</strong><small>People, places, eras, and the next questions worth asking.</small></div></li>
              <li><span>05</span><div><strong>Private family files</strong><small>Photographs, captions, permissions, and export-ready copies.</small></div></li>
            </ul>
          </div>
        </div>
      </section>

      <section className="listen-section">
        <Image src="/images/first-listen.webp" alt="An adult sister and brother listening together to a family story" fill sizes="100vw" />
        <div className="listen-overlay" />
        <div className="listen-copy">
          <span className="overline light"><i /> The first listen</span>
          <blockquote>“Wait—Dad never told you the pie story?”</blockquote>
          <p>The magic is not a dashboard. It is the moment two people hear a voice they know tell a story neither of them had.</p>
        </div>
      </section>

      <section className="pricing-section section-shell" id="pricing">
        <div className="section-intro centered compact-intro">
          <span className="overline"><i /> Honest price, deliberate pace</span>
          <h2>Start small. Keep only a real result.</h2>
          <p>No 52-week homework plan. No subscription to forget. One permission, one sitting, one finished piece at a time.</p>
        </div>
        <div className="pricing-card">
          <div className="pricing-main">
            <span className="pricing-label">Begin here</span>
            <div className="price-lockup"><sup>$</sup><strong>5</strong><span>once<br />to start</span></div>
            <h3>Open one Story Start</h3>
            <p>Set up a trusted permission path for one parent, grandparent, or loved one.</p>
            <Link href="/start" className="button button-primary button-full">Start their story for $5</Link>
            <small>The $5 covers permission outreach and is non-refundable after that work begins.</small>
          </div>
          <div className="pricing-lines">
            <div><span className="line-price">$79</span><p><strong>Keep the finished sitting</strong><small>Preview the result first. Payment unlocks the complete source audio, transcript, chapters, and one factual correction round.</small></p></div>
            <div><span className="line-price">$5</span><p><strong>Any next sitting starts small again</strong><small>Only when the family asks. Open another call, let them choose, then decide whether its finished result is worth keeping.</small></p></div>
            <div><span className="line-price">$0</span><p><strong>If they decline</strong><small>This Story Start stops and no $79 is charged. They may also choose the permanent do-not-call list.</small></p></div>
            <div className="pricing-promise"><span>✓</span><p><strong>Hear and read a real preview before the $79 decision.</strong><small>StorySitting earns the result payment by making something your family actually wants to keep.</small></p></div>
          </div>
        </div>
      </section>

      <section className="final-cta-section">
        <div className="final-cta-inner">
          <span className="overline light"><i /> One story is enough to begin</span>
          <h2>Who would your family<br />regret never asking?</h2>
          <p>Tell us who they are. We will help make the first hello safe, the sitting easy, and the result worth keeping.</p>
          <Link href="/start" className="button button-light button-large">Start their first story <span>$5 →</span></Link>
          <small>A real person reads every new Story Start.</small>
        </div>
      </section>
    </main>
  );
}
