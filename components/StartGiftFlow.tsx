"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type FormState = {
  buyer_name: string;
  buyer_email: string;
  relationship: string;
  storyteller_name: string;
  storyteller_phone: string;
  storyteller_timezone: string;
  best_times: string;
  personal_introduction: string;
  permission_path: "family_pass" | "human_hello" | "call_us";
  seeds: string[];
  sponsor_contact_authorized: boolean;
  website: string;
};

const INITIAL_STATE: FormState = {
  buyer_name: "",
  buyer_email: "",
  relationship: "",
  storyteller_name: "",
  storyteller_phone: "",
  storyteller_timezone: "America/Indiana/Indianapolis",
  best_times: "",
  personal_introduction: "",
  permission_path: "family_pass",
  seeds: ["", "", ""],
  sponsor_contact_authorized: false,
  website: ""
};

const STEP_NAMES = ["You", "Storyteller", "Permission", "First question"];

export function StartGiftFlow({
  returningStoryteller = "",
  returningQuestion = ""
}: {
  returningStoryteller?: string;
  returningQuestion?: string;
}) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(() => ({
    ...INITIAL_STATE,
    storyteller_name: returningStoryteller,
    seeds: [returningQuestion, "", ""]
  }));
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const idempotencyKey = useRef("");
  const previousStep = useRef(step);

  useEffect(() => {
    if (previousStep.current === step) return;
    previousStep.current = step;
    const frame = window.requestAnimationFrame(() => {
      const formElement = formRef.current;
      if (!formElement) return;
      const top = formElement.getBoundingClientRect().top + window.scrollY - 96;
      window.scrollTo({ top: Math.max(0, top), behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [step]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateSeed(index: number, value: string) {
    setForm((current) => ({
      ...current,
      seeds: current.seeds.map((seed, seedIndex) => (seedIndex === index ? value : seed))
    }));
  }

  function validateCurrentStep() {
    if (step === 0 && (!form.buyer_name.trim() || !form.buyer_email.includes("@") || !form.relationship.trim())) {
      return "Add your name, email, and relationship to the storyteller.";
    }
    if (step === 1 && (!form.storyteller_name.trim() || !form.storyteller_phone.trim() || !form.best_times.trim())) {
      return "Add what they like to be called, their phone number, and a good time.";
    }
    if (step === 3 && !form.seeds.some((seed) => seed.trim().length > 1)) {
      return "Add at least one story you would love to hear.";
    }
    return "";
  }

  function goNext() {
    const message = validateCurrentStep();
    if (message) {
      setError(message);
      return;
    }
    setError("");
    showStep(Math.min(3, step + 1));
  }

  function showStep(nextStep: number) {
    setStep(nextStep);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const message = validateCurrentStep();
    if (message) {
      setError(message);
      return;
    }
    if (!form.sponsor_contact_authorized) {
      setError("Please confirm that StorySitting may begin the permission process.");
      return;
    }

    setSubmitting(true);
    setError("");
    if (!idempotencyKey.current) idempotencyKey.current = window.crypto.randomUUID();

    try {
      const response = await fetch("/api/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey.current
        },
        body: JSON.stringify({
          buyer_name: form.buyer_name,
          buyer_email: form.buyer_email,
          relationship: form.relationship,
          storyteller_name: form.storyteller_name,
          storyteller_phone: form.storyteller_phone,
          storyteller_timezone: form.storyteller_timezone,
          best_times: form.best_times,
          story_seeds: form.seeds.map((seed) => seed.trim()).filter(Boolean),
          personal_introduction: form.personal_introduction,
          permission_path: form.permission_path,
          sponsor_contact_authorized: form.sponsor_contact_authorized,
          website: form.website
        })
      });
      const result = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !result.url) throw new Error(result.error || "Checkout could not be opened.");
      window.location.assign(result.url);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Checkout could not be opened.");
      setSubmitting(false);
    }
  }

  return (
    <form className="start-card" onSubmit={submit} noValidate ref={formRef}>
      <div className="start-form-promise">
        <div><span>Charged now</span><strong>$5</strong></div>
        <p>This opens one Story Start. It does not authorize a call and it does not begin a subscription.</p>
      </div>
      <ol className="start-progress" aria-label={`Step ${step + 1} of 4`}>
        {STEP_NAMES.map((name, index) => (
          <li className={index < step ? "complete" : index === step ? "current" : "future"} key={name}>
            <button
              type="button"
              aria-current={index === step ? "step" : undefined}
              disabled={index > step}
              onClick={() => index < step && showStep(index)}
            >
              <span>{index < step ? "✓" : index + 1}</span>
              <b>{name}</b>
            </button>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="start-step">
          <span className="start-step-label">Step 1 · Sponsor</span>
          <h2>Who is opening the door?</h2>
          <p>You fund the beginning, receive progress updates, and decide whether to keep the finished result. The storyteller keeps control of participation, recording, and sharing.</p>
          <div className="form-grid">
            <div className="field"><label htmlFor="buyer_name">Your name</label><input id="buyer_name" autoComplete="name" value={form.buyer_name} onChange={(event) => update("buyer_name", event.target.value)} placeholder="Mara Ellis" /></div>
            <div className="field"><label htmlFor="buyer_email">Your email</label><input id="buyer_email" type="email" autoComplete="email" value={form.buyer_email} onChange={(event) => update("buyer_email", event.target.value)} placeholder="mara@example.com" /></div>
            <div className="field full"><label htmlFor="relationship">Your relationship to them</label><input id="relationship" value={form.relationship} onChange={(event) => update("relationship", event.target.value)} placeholder="daughter, son, granddaughter, family friend…" /></div>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="start-step">
          <span className="start-step-label">Step 2 · Storyteller</span>
          <h2>Whose voice are we making room for?</h2>
          <p>We use this number only for this Story Start. A future sitting would require a new, deliberate start and fresh permission.</p>
          <div className="form-grid">
            <div className="field"><label htmlFor="storyteller_name">What they like to be called</label><input id="storyteller_name" value={form.storyteller_name} onChange={(event) => update("storyteller_name", event.target.value)} placeholder="Grandpa Ray, Mom, Eleanor…" /></div>
            <div className="field"><label htmlFor="storyteller_phone">Their phone number</label><input id="storyteller_phone" type="tel" autoComplete="tel" value={form.storyteller_phone} onChange={(event) => update("storyteller_phone", event.target.value)} placeholder="(317) 555-0134" /></div>
            <div className="field"><label htmlFor="timezone">Time zone</label><select id="timezone" value={form.storyteller_timezone} onChange={(event) => update("storyteller_timezone", event.target.value)}><option value="America/New_York">Eastern</option><option value="America/Chicago">Central</option><option value="America/Denver">Mountain</option><option value="America/Los_Angeles">Pacific</option><option value="America/Indiana/Indianapolis">Indiana (Eastern)</option></select></div>
            <div className="field"><label htmlFor="best_times">Good times to reach them</label><input id="best_times" value={form.best_times} onChange={(event) => update("best_times", event.target.value)} placeholder="Weekday mornings, after 2pm…" /></div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="start-step">
          <span className="start-step-label">Step 3 · Their choice</span>
          <h2>You can invite. Only they can authorize.</h2>
          <p>After checkout, you send a private Family Pass from your own phone. Their answer is followed by a direct human identity and permission check before any AI interview is scheduled.</p>
          <div className="permission-route" aria-label="Permission process">
            <div><span>01</span><p><strong>You send the Family Pass</strong><small>A private link, your introduction, and a separate four-digit family code.</small></p></div>
            <div><span>02</span><p><strong>They answer for themself</strong><small>Yes, no, stop, and do-not-call remain their choices.</small></p></div>
            <div><span>03</span><p><strong>A human verifies the choice</strong><small>No AI interview is scheduled from the sponsor&apos;s request alone.</small></p></div>
          </div>
          <div className="field" style={{ marginTop: 18 }}>
            <label htmlFor="personal_introduction">A note from you (optional)</label>
            <textarea id="personal_introduction" value={form.personal_introduction} onChange={(event) => update("personal_introduction", event.target.value)} placeholder={`I set this up because I would love to hear your stories about…`} />
            <small>We use your name and note so the invitation feels like a family gift, not a cold call.</small>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="start-step">
          <span className="start-step-label">Step 4 · The first thread</span>
          <h2>What would you hate to never ask?</h2>
          <p>One good question is enough. Add up to three; the sitting will follow the storyteller instead of racing through a script.</p>
          <div className="seed-list">
            {form.seeds.map((seed, index) => (
              <label className="seed-field" key={index}>
                <span>0{index + 1}</span>
                <input value={seed} onChange={(event) => updateSeed(index, event.target.value)} placeholder={index === 0 ? "How did you and Grandma first meet?" : index === 1 ? "What was the old farm like when you were a kid?" : "What do you wish your own parents had told you?"} />
              </label>
            ))}
          </div>

          <dl className="review-list" style={{ marginTop: 24 }}>
            <div><dt>Storyteller</dt><dd>{form.storyteller_name || "Not added"} · {form.storyteller_phone || "No phone"}</dd></div>
            <div><dt>Permission path</dt><dd>Family Pass + independent human verification</dd></div>
            <div><dt>Today</dt><dd>$5 Story Start</dd></div>
            <div><dt>After the sitting</dt><dd>Private preview · $0 additional</dd></div>
            <div><dt>Only if you keep it</dt><dd>$79 once · no subscription</dd></div>
          </dl>

          <div className="check-row" style={{ marginTop: 20 }}>
            <input id="sponsor_authorization" type="checkbox" checked={form.sponsor_contact_authorized} onChange={(event) => update("sponsor_contact_authorized", event.target.checked)} />
            <label htmlFor="sponsor_authorization">I am asking StorySitting to create a Family Pass for this adult. I understand that my $5 payment is not their consent, and that they may decline or stop at any time.</label>
          </div>
          <div className="field" aria-hidden="true" style={{ position: "absolute", left: "-10000px" }}>
            <label htmlFor="website">Website</label><input id="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={(event) => update("website", event.target.value)} />
          </div>
        </div>
      )}

      {error && <div className="form-error" role="alert" aria-live="polite">{error}</div>}

      <div className="form-actions">
        {step > 0 ? <button type="button" className="back-button" onClick={() => { setError(""); showStep(step - 1); }}>← Back</button> : <span />}
        {step < 3 ? <button type="button" className="button button-primary" onClick={goNext}>Continue <span>Step {step + 2} of 4 →</span></button> : <button type="submit" className="button button-primary" disabled={submitting}>{submitting ? "Opening secure checkout…" : <>Open this Story Start <span>$5 →</span></>}</button>}
      </div>
    </form>
  );
}
