import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { recordPermissionDisposition, verifyStorytellerIdentity } from "./server-actions";

type PermissionRequest = {
  id: string;
  sponsor_intake_id: string;
  story_room_id: string;
  permission_path: string;
  responded_at: string | null;
  expires_at: string;
};

type SponsorIntake = {
  id: string;
  buyer_name: string;
  relationship: string;
  storyteller_name: string;
  storyteller_phone: string;
  storyteller_timezone: string | null;
  best_times: string;
  personal_introduction: string | null;
};

type StoryRoom = {
  id: string;
  title: string;
  subject_name: string | null;
};

type PermissionCall = {
  id: string;
  permission_request_id: string | null;
  call_kind: "human_permission" | "inbound_permission";
  status: string;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  retell_call_id: string | null;
};

const resultMessages: Record<string, { tone: string; title: string; body: string }> = {
  verified: {
    tone: "tone-success",
    title: "Identity verified",
    body: "The storyteller’s direct authorization is recorded. An AI interview request is now queued, not dialed."
  },
  invalid: {
    tone: "tone-danger",
    title: "Verification was not recorded",
    body: "Complete every attestation and leave a specific evidence note of at least 20 characters."
  },
  stale: {
    tone: "tone-warning",
    title: "This request changed",
    body: "It is no longer awaiting identity verification. Refresh the queue before taking another action."
  },
  failed: {
    tone: "tone-danger",
    title: "Verification could not be saved",
    body: "No authorization was released. Review the request and try again, or escalate it for manual review."
  },
  call_required: {
    tone: "tone-warning",
    title: "A verified conversation is required",
    body: "Choose a completed human-call record tied to this request. A manual note alone cannot release scheduling."
  },
  disposition_recorded: {
    tone: "tone-success",
    title: "Outcome recorded",
    body: "The human-check outcome is saved and no AI interview was released."
  },
  disposition_invalid: {
    tone: "tone-danger",
    title: "Outcome was not recorded",
    body: "Choose an outcome, provide a specific note of at least 20 characters, and confirm the action."
  },
  disposition_call_required: {
    tone: "tone-warning",
    title: "A matching call record is required",
    body: "Choose a completed conversation for a decline or wrong person, or a terminal human-call attempt for could not verify."
  },
  disposition_failed: {
    tone: "tone-danger",
    title: "Outcome could not be saved",
    body: "No permission state changed. Review the call record and try again, or escalate the case."
  }
};

function compactTimestamp(value: string | null) {
  if (!value) return "Not recorded";
  return `${value.slice(0, 10)} · ${value.slice(11, 16)} UTC`;
}

function statusLabel(value: string) {
  return value.replaceAll("_", " ");
}

export default async function StaffPermissionsPage({
  searchParams
}: {
  searchParams?: Promise<{ result?: string; request?: string }>;
}) {
  const { supabase } = await requireStaff();
  const query = searchParams ? await searchParams : {};

  const { data, error: queueError } = await supabase
    .from("storyteller_permission_requests")
    .select("id,sponsor_intake_id,story_room_id,permission_path,responded_at,expires_at")
    .eq("status", "identity_pending")
    .order("responded_at", { ascending: true });

  const requests = (data ?? []) as PermissionRequest[];
  const intakeIds = [...new Set(requests.map((request) => request.sponsor_intake_id))];
  const roomIds = [...new Set(requests.map((request) => request.story_room_id))];
  const requestIds = requests.map((request) => request.id);

  let intakes: SponsorIntake[] = [];
  let rooms: StoryRoom[] = [];
  let calls: PermissionCall[] = [];

  if (requests.length > 0) {
    const [intakeResult, roomResult, callResult] = await Promise.all([
      supabase
        .from("sponsor_intakes")
        .select("id,buyer_name,relationship,storyteller_name,storyteller_phone,storyteller_timezone,best_times,personal_introduction")
        .in("id", intakeIds),
      supabase.from("story_rooms").select("id,title,subject_name").in("id", roomIds),
      supabase
        .from("call_requests")
        .select("id,permission_request_id,call_kind,status,created_at,started_at,ended_at,retell_call_id")
        .in("permission_request_id", requestIds)
        .in("call_kind", ["human_permission", "inbound_permission"])
        .order("created_at", { ascending: false })
    ]);

    intakes = (intakeResult.data ?? []) as SponsorIntake[];
    rooms = (roomResult.data ?? []) as StoryRoom[];
    calls = (callResult.data ?? []) as PermissionCall[];
  }

  const intakeById = new Map(intakes.map((intake) => [intake.id, intake]));
  const roomById = new Map(rooms.map((room) => [room.id, room]));
  const callsByRequestId = calls.reduce((map, call) => {
    if (!call.permission_request_id) return map;
    const existing = map.get(call.permission_request_id) ?? [];
    existing.push(call);
    map.set(call.permission_request_id, existing);
    return map;
  }, new Map<string, PermissionCall[]>());
  const notice = query.result ? resultMessages[query.result] : null;

  return (
    <main className="shell stack permission-ops">
      <section className="card permission-ops-hero">
        <div>
          <p className="kicker">Consent desk</p>
          <h1>Hear the yes from the storyteller.</h1>
          <p>
            A Family Pass can open the conversation, but it cannot authorize an AI call.
            Speak directly with the storyteller, document the narrow permission they gave,
            and only then release interview scheduling.
          </p>
        </div>
        <div className="permission-queue-count" aria-label={`${requests.length} awaiting identity verification`}>
          <strong>{requests.length}</strong>
          <span>awaiting<br />a human check</span>
        </div>
      </section>

      <nav className="permission-boundary" aria-label="Storyteller authorization boundary">
        <div className="complete">
          <span>01</span>
          <p><strong>Family Pass</strong>Storyteller submits a private response.</p>
        </div>
        <div className="current">
          <span>02</span>
          <p><strong>Human identity check</strong>Operator speaks to the storyteller directly.</p>
        </div>
        <div>
          <span>03</span>
          <p><strong>Interview queue</strong>AI scheduling can be released after verification.</p>
        </div>
      </nav>

      {notice ? (
        <section className={`permission-ops-notice ${notice.tone}`} role="status">
          <strong>{notice.title}</strong>
          <p>{notice.body}</p>
        </section>
      ) : null}

      <section className="permission-ops-principle">
        <span aria-hidden="true">✦</span>
        <p>
          <strong>The Family Pass code is context, not identity proof.</strong> Confirm that you are
          speaking with the storyteller—not the sponsor—and ask for their own agreement to a later
          AI interview. Recording and transcription still require separate spoken permission when
          that interview begins.
        </p>
        <Link className="btn secondary" href="/staff">Back to Mission Control</Link>
      </section>

      {queueError ? (
        <section className="card tone-danger">
          <h2>The queue could not be loaded.</h2>
          <p>No verification controls are available until the connection is restored.</p>
        </section>
      ) : null}

      {!queueError && requests.length === 0 ? (
        <section className="card permission-ops-empty">
          <span aria-hidden="true">✓</span>
          <div>
            <p className="kicker">Queue clear</p>
            <h2>No storyteller is waiting.</h2>
            <p>New cases appear here only after a storyteller responds yes to their Family Pass.</p>
          </div>
        </section>
      ) : null}

      <div className="permission-case-list">
        {requests.map((request, index) => {
          const intake = intakeById.get(request.sponsor_intake_id);
          const room = roomById.get(request.story_room_id);
          const permissionCalls = callsByRequestId.get(request.id) ?? [];
          const latestPermissionCall = permissionCalls[0];
          const eligibleCalls = permissionCalls.filter((call) =>
            call.status === "completed" && Boolean(call.ended_at) && Boolean(call.retell_call_id)
          );
          const dispositionCalls = permissionCalls.filter((call) =>
            Boolean(call.retell_call_id) && (
              call.status === "completed" ||
              ["no_answer", "declined", "failed", "needs_human_review"].includes(call.status)
            )
          );
          if (!intake) return null;

          return (
            <article className="card permission-case" id={`request-${request.id}`} key={request.id}>
              <header className="permission-case-head">
                <div>
                  <p className="kicker">Case {String(index + 1).padStart(2, "0")} · identity pending</p>
                  <h2>{intake.storyteller_name}</h2>
                  <p>{room?.title ?? `Story for ${room?.subject_name ?? intake.storyteller_name}`}</p>
                </div>
                <span className="badge strong">Family Pass received</span>
              </header>

              <div className="permission-case-grid">
                <section className="permission-contact-panel">
                  <div className="permission-contact-callout">
                    <span>Storyteller number on file</span>
                    <strong>{intake.storyteller_phone}</strong>
                    <small>
                      {intake.storyteller_timezone || "Timezone not supplied"} · Best time: {intake.best_times}<br />
                      Use the managed calling line so the connected conversation is captured in this case.
                    </small>
                  </div>

                  <dl className="permission-case-details">
                    <div><dt>Sponsor</dt><dd>{intake.buyer_name}</dd></div>
                    <div><dt>Relationship</dt><dd>{intake.relationship}</dd></div>
                    <div><dt>Pass response</dt><dd>{compactTimestamp(request.responded_at)}</dd></div>
                    <div><dt>Permission path</dt><dd>{statusLabel(request.permission_path)}</dd></div>
                    <div><dt>Human-call task</dt><dd>{statusLabel(latestPermissionCall?.status ?? "not created")}</dd></div>
                    <div><dt>Pass expires</dt><dd>{compactTimestamp(request.expires_at)}</dd></div>
                  </dl>

                  {intake.personal_introduction ? (
                    <blockquote>
                      “{intake.personal_introduction}”
                      <small>Sponsor’s introduction · context only</small>
                    </blockquote>
                  ) : null}

                  <div className="permission-call-script">
                    <p className="kicker">Plain-language check</p>
                    <p>
                      “Your family asked StorySitting to invite you to share a story. I’m calling to
                      confirm that I’m speaking with {intake.storyteller_name}, and that <em>you</em> are
                      comfortable receiving a later AI-guided interview call. That future call will
                      separately ask before any recording or transcription begins.”
                    </p>
                  </div>
                </section>

                <section className="permission-verification-form">
                  <div>
                    <p className="kicker">Operator evidence</p>
                    <h3>Record the direct check</h3>
                    <p>Do not continue if you spoke only with the sponsor, reached voicemail, or are unsure who answered.</p>
                  </div>

                  <form action={verifyStorytellerIdentity} className="permission-positive-form">
                    <input type="hidden" name="permission_request_id" value={request.id} />

                    {eligibleCalls.length > 0 ? (
                      <label className="field">
                        <span>Verified conversation</span>
                        <select name="human_call_request_id" required defaultValue={eligibleCalls[0].id}>
                          {eligibleCalls.map((call) => (
                            <option key={call.id} value={call.id}>
                              {call.call_kind === "inbound_permission" ? "Storyteller inbound call" : "Staff human call"}
                              {` · ${statusLabel(call.status)} · ${compactTimestamp(call.ended_at ?? call.started_at ?? call.created_at)}`}
                            </option>
                          ))}
                        </select>
                        <small>The completed call determines whether consent was captured by human or inbound phone.</small>
                      </label>
                    ) : (
                      <div className="permission-call-gate" role="note">
                        <strong>No completed conversation on record</strong>
                        <p>Complete the human call through the managed line. This form unlocks only after that call has ended successfully.</p>
                      </div>
                    )}

                    <label className="field">
                      <span>Evidence note</span>
                      <textarea
                        name="evidence_note"
                        minLength={20}
                        maxLength={1000}
                        required
                        placeholder="What the storyteller personally confirmed and the non-secret signal used to establish identity. Do not enter passwords, government IDs, or financial information."
                      />
                    </label>

                    <div className="permission-attestations">
                      <label>
                        <input type="checkbox" name="direct_contact_confirmed" value="yes" required />
                        <span>I spoke directly with the storyteller named above—not only with the sponsor.</span>
                      </label>
                      <label>
                        <input type="checkbox" name="ai_interview_confirmed" value="yes" required />
                        <span>The storyteller personally agreed to receive a later AI-guided interview call.</span>
                      </label>
                      <label>
                        <input type="checkbox" name="recording_boundary_confirmed" value="yes" required />
                        <span>I explained that this does not grant recording or transcription permission; those are asked separately on the call.</span>
                      </label>
                    </div>

                    <button type="submit" disabled={eligibleCalls.length === 0}>Verify identity &amp; release scheduling</button>
                    <small className="permission-form-fineprint">
                      This creates verified contact and AI-interview consent events. It does not place a call itself.
                    </small>
                  </form>

                  <details className="permission-disposition">
                    <summary>They declined, it was the wrong person, or I could not verify</summary>
                    <form action={recordPermissionDisposition}>
                      <input type="hidden" name="permission_request_id" value={request.id} />

                      {dispositionCalls.length > 0 ? (
                        <label className="field">
                          <span>Human-call record</span>
                          <select name="human_call_request_id" required defaultValue={dispositionCalls[0].id}>
                            {dispositionCalls.map((call) => (
                              <option key={call.id} value={call.id}>
                                {call.call_kind === "inbound_permission" ? "Storyteller inbound call" : "Staff human call"}
                                {` · ${statusLabel(call.status)} · ${compactTimestamp(call.ended_at ?? call.started_at ?? call.created_at)}`}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        <div className="permission-call-gate">
                          <strong>No terminal human-call attempt on record</strong>
                          <p>Finish or disposition the managed call before recording its permission outcome.</p>
                        </div>
                      )}

                      <label className="field">
                        <span>Outcome</span>
                        <select name="disposition" required defaultValue="could_not_verify">
                          <option value="could_not_verify">Could not verify identity or permission</option>
                          <option value="declined">Storyteller declined the AI interview</option>
                          <option value="wrong_person">Wrong person or wrong number</option>
                        </select>
                      </label>

                      <label className="field">
                        <span>Operator note</span>
                        <textarea
                          name="operator_notes"
                          minLength={20}
                          maxLength={1000}
                          required
                          placeholder="Describe what happened without recording passwords, government IDs, or financial information."
                        />
                      </label>

                      <label className="permission-negative-confirmation">
                        <input type="checkbox" name="negative_outcome_confirmed" value="yes" required />
                        <span>I reviewed the selected call and confirm this outcome. No AI interview should be released from this response.</span>
                      </label>

                      <button className="permission-disposition-button" type="submit" disabled={dispositionCalls.length === 0}>
                        Record outcome without scheduling
                      </button>
                    </form>
                  </details>
                </section>
              </div>
            </article>
          );
        })}
      </div>
    </main>
  );
}
