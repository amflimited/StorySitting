import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { recordStorytellerChapterRelease, verifySpokenConsentCandidate } from "./server-actions";

export const metadata: Metadata = {
  title: "Consent & Release Desk | StorySitting",
  robots: { index: false, follow: false }
};

type ConsentCandidate = {
  id: string;
  story_room_id: string;
  call_request_id: string;
  storyteller_name: string;
  consent_scope: string;
  decision: "granted" | "declined" | "revoked";
  capture_method: "spoken_on_call";
  verification_status: "pending";
  occurred_at: string;
  expires_at: string | null;
};

type StoryChapter = {
  id: string;
  story_room_id: string;
  call_request_id: string | null;
  title: string;
  preview_excerpt: string | null;
  status: "storyteller_review";
  storyteller_share_decision: "pending";
  updated_at: string;
};

type CurrentReleaseChapter = {
  id: string;
  story_room_id: string;
  call_request_id: string | null;
  title: string;
  preview_excerpt: string | null;
  status: "sponsor_preview" | "approved" | "delivered";
  storyteller_share_decision: "family";
  updated_at: string;
};

type CallRequest = {
  id: string;
  story_room_id: string;
  call_kind: string;
  status: string;
  direction: string;
  attempt_number: number;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  outcome: string | null;
  retell_call_id: string;
  created_at: string;
};

type StoryRoom = {
  id: string;
  title: string;
  subject_name: string | null;
};

type FinishedResultOrder = {
  id: string;
  story_chapter_id: string;
  status: string;
  amount_cents: number | null;
  created_at: string;
};

type ChapterReleaseEvent = {
  story_chapter_id: string;
  decision: "granted" | "revoked" | "declined";
  occurred_at: string;
};

type ResultNotice = {
  tone: string;
  title: string;
  body: string;
};

const resultMessages: Record<string, ResultNotice> = {
  consent_verified: {
    tone: "tone-success",
    title: "Spoken evidence verified",
    body: "The operator review is recorded. The consent ledger now reflects that the call evidence supports this decision."
  },
  consent_rejected: {
    tone: "tone-warning",
    title: "Candidate rejected",
    body: "The extraction was marked unreliable. It cannot be used as verified storyteller permission."
  },
  consent_invalid: {
    tone: "tone-danger",
    title: "Review was not submitted",
    body: "Review the evidence, add a specific note of at least 20 characters, and choose verify or reject."
  },
  consent_stale: {
    tone: "tone-warning",
    title: "This candidate already changed",
    body: "It is no longer a pending spoken-on-call candidate. Refresh the desk before taking another action."
  },
  consent_call_required: {
    tone: "tone-warning",
    title: "Completed call evidence is required",
    body: "The source call must be completed and ended before an operator can verify its consent evidence."
  },
  consent_failed: {
    tone: "tone-danger",
    title: "Consent review could not be saved",
    body: "No consent state was released. Recheck the call evidence and try again, or escalate the case."
  },
  release_recorded: {
    tone: "tone-success",
    title: "Storyteller decision recorded",
    body: "The chapter moved according to the storyteller’s direct review decision."
  },
  release_access_removed: {
    tone: "tone-success",
    title: "Current family access removed",
    body: "The storyteller’s new private or withheld decision is recorded. Sponsor access is now hidden by the release ledger."
  },
  release_revocation_invalid: {
    tone: "tone-danger",
    title: "Access removal was not confirmed",
    body: "Choose private or withheld and explicitly confirm that current sponsor access—including paid delivery access—will be removed."
  },
  release_new_call_required: {
    tone: "tone-warning",
    title: "A new review call is required",
    body: "Use a completed managed storyteller-review call that ended after the current family release. The earlier release call cannot revoke itself."
  },
  release_invalid: {
    tone: "tone-danger",
    title: "Release decision was not submitted",
    body: "Choose the storyteller’s decision, add a specific note of at least 20 characters, and confirm the review."
  },
  release_stale: {
    tone: "tone-warning",
    title: "This chapter already changed",
    body: "It is no longer pending storyteller review. Refresh the desk before taking another action."
  },
  release_call_required: {
    tone: "tone-warning",
    title: "A completed storyteller-review call is required",
    body: "Choose a completed managed story-review call tied to this Story Room. An operator note alone cannot release a chapter."
  },
  release_failed: {
    tone: "tone-danger",
    title: "The release decision could not be saved",
    body: "The chapter remains private. Confirm the scope ledger and managed review call before trying again."
  }
};

function compactTimestamp(value: string | null) {
  if (!value) return "Not recorded";
  return `${value.slice(0, 10)} · ${value.slice(11, 16)} UTC`;
}

function statusLabel(value: string | null) {
  return value ? value.replaceAll("_", " ") : "not recorded";
}

function callLength(seconds: number | null) {
  if (!seconds) return "Duration unavailable";
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function moneyLabel(amountCents: number | null) {
  if (amountCents === null) return "Paid result";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amountCents / 100);
}

function scopeMeaning(scope: string) {
  const meanings: Record<string, string> = {
    recording: "Keep audio from this sitting",
    transcription: "Turn this sitting into written words",
    editing: "Shape the sitting into a finished story",
    family_sharing: "Let the named family sponsor receive this result",
    public_use: "Use this story publicly",
    model_training: "Use this material for model training"
  };
  return meanings[scope] ?? statusLabel(scope);
}

export default async function StaffConsentReleasesPage({
  searchParams
}: {
  searchParams?: Promise<{ result?: string; event?: string; chapter?: string }>;
}) {
  const { supabase } = await requireStaff();
  const params = searchParams ? await searchParams : {};

  const [candidateResult, chapterResult, currentReleaseResult] = await Promise.all([
    supabase
      .from("consent_events")
      .select("id,story_room_id,call_request_id,storyteller_name,consent_scope,decision,capture_method,verification_status,occurred_at,expires_at")
      .eq("capture_method", "spoken_on_call")
      .eq("verification_status", "pending")
      .not("call_request_id", "is", null)
      .order("occurred_at", { ascending: true }),
    supabase
      .from("story_chapters")
      .select("id,story_room_id,call_request_id,title,preview_excerpt,status,storyteller_share_decision,updated_at")
      .eq("status", "storyteller_review")
      .eq("storyteller_share_decision", "pending")
      .order("updated_at", { ascending: true }),
    supabase
      .from("story_chapters")
      .select("id,story_room_id,call_request_id,title,preview_excerpt,status,storyteller_share_decision,updated_at")
      .in("status", ["sponsor_preview", "approved", "delivered"])
      .eq("storyteller_share_decision", "family")
      .order("updated_at", { ascending: true })
  ]);

  const candidates = (candidateResult.data ?? []) as ConsentCandidate[];
  const chapters = (chapterResult.data ?? []) as StoryChapter[];
  const currentReleases = (currentReleaseResult.data ?? []) as CurrentReleaseChapter[];
  const candidateCallIds = [...new Set(candidates.map((candidate) => candidate.call_request_id))];
  const reviewRoomIds = [...new Set([
    ...chapters.map((chapter) => chapter.story_room_id),
    ...currentReleases.map((chapter) => chapter.story_room_id)
  ])];
  const roomIds = [...new Set([
    ...candidates.map((candidate) => candidate.story_room_id),
    ...reviewRoomIds
  ])];
  const currentReleaseIds = currentReleases.map((chapter) => chapter.id);

  let sourceCalls: CallRequest[] = [];
  let reviewCalls: CallRequest[] = [];
  let rooms: StoryRoom[] = [];
  let finishedResultOrders: FinishedResultOrder[] = [];
  let releaseEvents: ChapterReleaseEvent[] = [];

  const supportingQueries: PromiseLike<{ data: unknown[] | null; error: unknown }>[] = [];
  if (candidateCallIds.length > 0) {
    supportingQueries.push(
      supabase
        .from("call_requests")
        .select("id,story_room_id,call_kind,status,direction,attempt_number,started_at,ended_at,duration_seconds,outcome,retell_call_id,created_at")
        .in("id", candidateCallIds)
        .not("retell_call_id", "is", null) as unknown as PromiseLike<{ data: unknown[] | null; error: unknown }>
    );
  }
  if (reviewRoomIds.length > 0) {
    supportingQueries.push(
      supabase
        .from("call_requests")
        .select("id,story_room_id,call_kind,status,direction,attempt_number,started_at,ended_at,duration_seconds,outcome,retell_call_id,created_at")
        .in("story_room_id", reviewRoomIds)
        .eq("call_kind", "story_review")
        .eq("status", "completed")
        .not("ended_at", "is", null)
        .not("retell_call_id", "is", null)
        .order("ended_at", { ascending: false }) as unknown as PromiseLike<{ data: unknown[] | null; error: unknown }>
    );
  }
  if (roomIds.length > 0) {
    supportingQueries.push(
      supabase
        .from("story_rooms")
        .select("id,title,subject_name")
        .in("id", roomIds) as unknown as PromiseLike<{ data: unknown[] | null; error: unknown }>
    );
  }
  if (currentReleaseIds.length > 0) {
    supportingQueries.push(
      supabase
        .from("orders")
        .select("id,story_chapter_id,status,amount_cents,created_at")
        .in("story_chapter_id", currentReleaseIds)
        .eq("order_type", "finished_result") as unknown as PromiseLike<{ data: unknown[] | null; error: unknown }>
    );
    supportingQueries.push(
      supabase
        .from("consent_events")
        .select("story_chapter_id,decision,occurred_at")
        .in("story_chapter_id", currentReleaseIds)
        .eq("consent_scope", "family_sharing")
        .eq("verification_status", "verified")
        .order("occurred_at", { ascending: false }) as unknown as PromiseLike<{ data: unknown[] | null; error: unknown }>
    );
  }

  const supportingResults = await Promise.all(supportingQueries);
  let supportingIndex = 0;
  if (candidateCallIds.length > 0) sourceCalls = (supportingResults[supportingIndex++].data ?? []) as CallRequest[];
  if (reviewRoomIds.length > 0) reviewCalls = (supportingResults[supportingIndex++].data ?? []) as CallRequest[];
  if (roomIds.length > 0) rooms = (supportingResults[supportingIndex++].data ?? []) as StoryRoom[];
  if (currentReleaseIds.length > 0) {
    finishedResultOrders = (supportingResults[supportingIndex++].data ?? []) as FinishedResultOrder[];
    releaseEvents = (supportingResults[supportingIndex++].data ?? []) as ChapterReleaseEvent[];
  }

  const supportingError = supportingResults.some((result) => Boolean(result.error));
  const loadError = Boolean(candidateResult.error || chapterResult.error || currentReleaseResult.error || supportingError);
  const roomById = new Map(rooms.map((room) => [room.id, room]));
  const sourceCallById = new Map(sourceCalls.map((call) => [call.id, call]));
  const candidatesByCall = candidates.reduce((map, candidate) => {
    const group = map.get(candidate.call_request_id) ?? [];
    group.push(candidate);
    map.set(candidate.call_request_id, group);
    return map;
  }, new Map<string, ConsentCandidate[]>());
  const reviewCallsByRoom = reviewCalls.reduce((map, call) => {
    const group = map.get(call.story_room_id) ?? [];
    group.push(call);
    map.set(call.story_room_id, group);
    return map;
  }, new Map<string, CallRequest[]>());
  const paidOrderByChapter = new Map(
    finishedResultOrders
      .filter((order) => order.status === "paid")
      .map((order) => [order.story_chapter_id, order])
  );
  const latestReleaseByChapter = releaseEvents.reduce((map, event) => {
    if (!map.has(event.story_chapter_id)) map.set(event.story_chapter_id, event);
    return map;
  }, new Map<string, ChapterReleaseEvent>());
  const candidateGroups = [...candidatesByCall.entries()];
  const notice = params.result ? resultMessages[params.result] : null;

  return (
    <main className="shell stack permission-ops">
      <section className="card permission-ops-hero">
        <div>
          <p className="kicker">Consent &amp; release desk</p>
          <h1>Nothing leaves the room on assumption.</h1>
          <p>
            Review what the storyteller actually said, verify each narrow consent scope,
            then record their chapter decision from a completed human review call.
          </p>
        </div>
        <div className="permission-queue-count" aria-label={`${candidates.length} consent candidates and ${chapters.length} chapters awaiting review`}>
          <strong>{candidates.length + chapters.length}</strong>
          <span>decisions<br />awaiting review</span>
        </div>
      </section>

      <nav className="permission-boundary" aria-label="Story evidence release boundary">
        <div className="complete">
          <span>01</span>
          <p><strong>Private sitting</strong>Raw audio and transcript remain staff-only.</p>
        </div>
        <div className="current">
          <span>02</span>
          <p><strong>Human evidence review</strong>Verify the storyteller’s exact spoken scopes.</p>
        </div>
        <div>
          <span>03</span>
          <p><strong>Storyteller release</strong>Share, keep private, or withhold the finished chapter.</p>
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
          <strong>Verification and release are separate decisions.</strong> Verifying a candidate means
          the evidence supports what was said—even when the storyteller said no. Only a later, completed
          human story-review call can release a finished chapter to family.
        </p>
        <Link className="btn secondary" href="/staff">Back to Mission Control</Link>
      </section>

      {loadError ? (
        <section className="card tone-danger">
          <h2>The desk could not be loaded safely.</h2>
          <p>No verification or release controls are shown from an incomplete data set. Restore the database connection and refresh.</p>
        </section>
      ) : (
        <>
          <section className="card between">
            <div>
              <p className="kicker">Queue one</p>
              <h2>Spoken consent evidence</h2>
              <p>Candidate statements are grouped by their source call. Review each scope independently against the managed call record.</p>
            </div>
            <span className="badge strong">{candidates.length} pending scope{candidates.length === 1 ? "" : "s"}</span>
          </section>

          {candidateGroups.length === 0 ? (
            <section className="card permission-ops-empty">
              <span aria-hidden="true">✓</span>
              <div>
                <p className="kicker">Evidence queue clear</p>
                <h2>No spoken candidates are waiting.</h2>
                <p>New candidates appear after a completed managed interview produces consent evidence.</p>
              </div>
            </section>
          ) : (
            <div className="permission-case-list">
              {candidateGroups.map(([callId, callCandidates], index) => {
                const sourceCall = sourceCallById.get(callId);
                const room = roomById.get(callCandidates[0].story_room_id);
                const callIsReviewable = sourceCall?.status === "completed" &&
                  Boolean(sourceCall.ended_at) && Boolean(sourceCall.retell_call_id);
                return (
                  <article className="card permission-case" key={callId}>
                    <header className="permission-case-head">
                      <div>
                        <p className="kicker">Evidence call {String(index + 1).padStart(2, "0")} · {statusLabel(sourceCall?.call_kind ?? null)}</p>
                        <h2>{callCandidates[0].storyteller_name}</h2>
                        <p>{room?.title ?? `Story for ${room?.subject_name ?? callCandidates[0].storyteller_name}`}</p>
                      </div>
                      <span className="badge strong">{callCandidates.length} scope{callCandidates.length === 1 ? "" : "s"}</span>
                    </header>

                    <div className="permission-case-grid">
                      <section className="permission-contact-panel">
                        <div className="permission-contact-callout">
                          <span>Managed source call</span>
                          <strong>{statusLabel(sourceCall?.status ?? "missing")}</strong>
                          <small>
                            {statusLabel(sourceCall?.direction ?? null)} · attempt {sourceCall?.attempt_number ?? "—"} · {callLength(sourceCall?.duration_seconds ?? null)}
                          </small>
                        </div>
                        <dl className="permission-case-details">
                          <div><dt>Ended</dt><dd>{compactTimestamp(sourceCall?.ended_at ?? null)}</dd></div>
                          <div><dt>Call outcome</dt><dd>{statusLabel(sourceCall?.outcome ?? null)}</dd></div>
                          <div><dt>Story Room</dt><dd>{room?.title ?? "Room unavailable"}</dd></div>
                          <div><dt>Candidate count</dt><dd>{callCandidates.length} narrow scope{callCandidates.length === 1 ? "" : "s"}</dd></div>
                        </dl>
                        <div className="permission-call-script">
                          <p className="kicker">Review standard</p>
                          <p>
                            Listen to the surrounding exchange, confirm the speaker is the storyteller,
                            and decide whether the evidence supports this exact scope and decision. Do not
                            infer one scope from another.
                          </p>
                        </div>
                      </section>

                      <section className="permission-verification-form">
                        <div>
                          <p className="kicker">Scope-by-scope review</p>
                          <h3>Verify only what the call proves</h3>
                          <p>A rejection marks the extraction unreliable; it does not turn a spoken no into a yes.</p>
                        </div>

                        {!callIsReviewable ? (
                          <div className="permission-call-gate" role="note">
                            <strong>Source call is not complete</strong>
                            <p>Controls remain locked until this managed call has a completed status, end time, and provider reference.</p>
                          </div>
                        ) : null}

                        {callCandidates.map((candidate) => (
                          <form
                            action={verifySpokenConsentCandidate}
                            className="mini-card stack"
                            id={`event-${candidate.id}`}
                            key={candidate.id}
                          >
                            <input type="hidden" name="consent_event_id" value={candidate.id} />
                            <div className="between">
                              <div>
                                <p className="kicker">{statusLabel(candidate.consent_scope)}</p>
                                <h3>{candidate.decision === "granted" ? "Storyteller said yes" : candidate.decision === "declined" ? "Storyteller said no" : "Storyteller revoked permission"}</h3>
                              </div>
                              <span className={`badge ${candidate.decision === "granted" ? "strong" : ""}`}>{statusLabel(candidate.decision)}</span>
                            </div>
                            <p>{scopeMeaning(candidate.consent_scope)}</p>
                            <small className="muted">Candidate captured {compactTimestamp(candidate.occurred_at)}</small>

                            <label className="field">
                              <span>Operator evidence note</span>
                              <textarea
                                name="operator_notes"
                                minLength={20}
                                maxLength={1000}
                                required
                                placeholder="What you heard immediately before and after this statement, and why it supports or fails to support this exact scope."
                              />
                            </label>

                            <div className="permission-attestations">
                              <label>
                                <input type="checkbox" name="evidence_reviewed" value="yes" required />
                                <span>I reviewed the managed call evidence in context and evaluated only this named scope.</span>
                              </label>
                            </div>

                            <div className="between">
                              <button type="submit" name="verification_status" value="verified" disabled={!callIsReviewable}>
                                Verify this {statusLabel(candidate.decision)}
                              </button>
                              <button
                                className="permission-disposition-button"
                                type="submit"
                                name="verification_status"
                                value="rejected"
                                disabled={!callIsReviewable}
                              >
                                Reject candidate
                              </button>
                            </div>
                          </form>
                        ))}
                      </section>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          <section className="card between">
            <div>
              <p className="kicker">Queue two</p>
              <h2>Storyteller chapter decisions</h2>
              <p>Record the storyteller’s final decision only from a completed human story-review call tied to the same Story Room.</p>
            </div>
            <span className="badge strong">{chapters.length} chapter{chapters.length === 1 ? "" : "s"}</span>
          </section>

          {chapters.length === 0 ? (
            <section className="card permission-ops-empty">
              <span aria-hidden="true">✓</span>
              <div>
                <p className="kicker">Release queue clear</p>
                <h2>No chapter is awaiting a decision.</h2>
                <p>Finished drafts appear here only when they enter storyteller review.</p>
              </div>
            </section>
          ) : (
            <div className="permission-case-list">
              {chapters.map((chapter, index) => {
                const room = roomById.get(chapter.story_room_id);
                const eligibleReviewCalls = reviewCallsByRoom.get(chapter.story_room_id) ?? [];
                return (
                  <article className="card permission-case" id={`chapter-${chapter.id}`} key={chapter.id}>
                    <header className="permission-case-head">
                      <div>
                        <p className="kicker">Chapter {String(index + 1).padStart(2, "0")} · storyteller review</p>
                        <h2>{chapter.title}</h2>
                        <p>{room?.title ?? `Story for ${room?.subject_name ?? "the storyteller"}`}</p>
                      </div>
                      <span className="badge">Private until released</span>
                    </header>

                    <div className="permission-case-grid">
                      <section className="permission-contact-panel">
                        <div className="permission-contact-callout">
                          <span>Current boundary</span>
                          <strong>Storyteller only</strong>
                          <small>Neither a preview nor the finished result is visible to the sponsor yet.</small>
                        </div>
                        <dl className="permission-case-details">
                          <div><dt>Draft stage</dt><dd>{statusLabel(chapter.status)}</dd></div>
                          <div><dt>Share decision</dt><dd>{statusLabel(chapter.storyteller_share_decision)}</dd></div>
                          <div><dt>Last updated</dt><dd>{compactTimestamp(chapter.updated_at)}</dd></div>
                          <div><dt>Review calls</dt><dd>{eligibleReviewCalls.length} eligible</dd></div>
                        </dl>
                        {chapter.preview_excerpt ? (
                          <blockquote>
                            “{chapter.preview_excerpt}”
                            <small>Working excerpt · still private</small>
                          </blockquote>
                        ) : (
                          <div className="permission-call-gate">
                            <strong>No working excerpt supplied</strong>
                            <p>Review the finished chapter through the private production workspace before calling the storyteller.</p>
                          </div>
                        )}
                      </section>

                      <section className="permission-verification-form">
                        <div>
                          <p className="kicker">Direct storyteller decision</p>
                          <h3>Share, keep private, or withhold</h3>
                          <p>The RPC rechecks the call, room, evidence ledger, and current chapter state before anything can move.</p>
                        </div>

                        <form action={recordStorytellerChapterRelease} className="permission-positive-form">
                          <input type="hidden" name="story_chapter_id" value={chapter.id} />

                          {eligibleReviewCalls.length > 0 ? (
                            <label className="field">
                              <span>Completed storyteller-review call</span>
                              <select name="review_call_request_id" required defaultValue={eligibleReviewCalls[0].id}>
                                {eligibleReviewCalls.map((call) => (
                                  <option key={call.id} value={call.id}>
                                    Human story review · {compactTimestamp(call.ended_at ?? call.created_at)} · {callLength(call.duration_seconds)}
                                  </option>
                                ))}
                              </select>
                              <small>This call must belong to the same Story Room and contain the storyteller’s own decision.</small>
                            </label>
                          ) : (
                            <div className="permission-call-gate" role="note">
                              <strong>No completed story-review call</strong>
                              <p>Complete the human review through the managed line. A staff note or sponsor request cannot substitute for the storyteller’s decision.</p>
                            </div>
                          )}

                          <label className="field">
                            <span>Storyteller’s decision</span>
                            <select name="decision" required defaultValue="">
                              <option value="" disabled>Select the decision heard on the call</option>
                              <option value="family">Share this chapter with the named family sponsor</option>
                              <option value="private">Keep this chapter private to the storyteller</option>
                              <option value="withheld">Withhold this chapter from delivery</option>
                            </select>
                            <small>“Family” is narrow sharing for this result—not public use or model training.</small>
                          </label>

                          <label className="field">
                            <span>Operator release note</span>
                            <textarea
                              name="operator_notes"
                              minLength={20}
                              maxLength={1000}
                              required
                              placeholder="Record the storyteller’s decision in plain language and any privacy edits or conditions they stated."
                            />
                          </label>

                          <div className="permission-attestations">
                            <label>
                              <input type="checkbox" name="storyteller_decision_confirmed" value="yes" required />
                              <span>I spoke with the storyteller on the selected managed review call and this is their decision—not the sponsor’s or my inference.</span>
                            </label>
                          </div>

                          <button type="submit" disabled={eligibleReviewCalls.length === 0}>Record the storyteller’s decision</button>
                          <small className="permission-form-fineprint">
                            The database keeps the chapter private if the release prerequisites are incomplete or contradictory.
                          </small>
                        </form>
                      </section>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          <section className="card between">
            <div>
              <p className="kicker">Current access</p>
              <h2>Privacy revocation</h2>
              <p>
                A storyteller can change their mind after release. Use a new, completed managed
                review call to remove current sponsor access immediately.
              </p>
            </div>
            <span className="badge">{currentReleases.length} family-visible chapter{currentReleases.length === 1 ? "" : "s"}</span>
          </section>

          {currentReleases.length === 0 ? (
            <section className="card permission-ops-empty">
              <span aria-hidden="true">✓</span>
              <div>
                <p className="kicker">No live releases</p>
                <h2>No family-shared chapter is active.</h2>
                <p>This lane appears when a sponsor currently has preview or finished-result access.</p>
              </div>
            </section>
          ) : (
            <div className="permission-case-list">
              {currentReleases.map((chapter, index) => {
                const room = roomById.get(chapter.story_room_id);
                const paidOrder = paidOrderByChapter.get(chapter.id);
                const latestReleaseEvent = latestReleaseByChapter.get(chapter.id);
                const latestRelease = latestReleaseEvent?.decision === "granted" ? latestReleaseEvent : undefined;
                const eligibleRevocationCalls = latestRelease
                  ? (reviewCallsByRoom.get(chapter.story_room_id) ?? []).filter((call) =>
                      Boolean(call.ended_at) &&
                      Boolean(call.retell_call_id) &&
                      new Date(call.ended_at as string).getTime() > new Date(latestRelease.occurred_at).getTime()
                    )
                  : [];
                const highImpact = Boolean(paidOrder) || chapter.status === "delivered";

                return (
                  <article className="card permission-case" id={`chapter-${chapter.id}`} key={chapter.id}>
                    <header className="permission-case-head">
                      <div>
                        <p className="kicker">Live release {String(index + 1).padStart(2, "0")} · {statusLabel(chapter.status)}</p>
                        <h2>{chapter.title}</h2>
                        <p>{room?.title ?? `Story for ${room?.subject_name ?? "the storyteller"}`}</p>
                      </div>
                      <span className="badge strong">Family access active</span>
                    </header>

                    <div className="permission-case-grid">
                      <section className="permission-contact-panel">
                        <div className="permission-contact-callout">
                          <span>Current boundary</span>
                          <strong>Shared with family</strong>
                          <small>
                            Current app access remains active until a verified new storyteller decision is recorded.
                          </small>
                        </div>

                        <dl className="permission-case-details">
                          <div><dt>Access stage</dt><dd>{statusLabel(chapter.status)}</dd></div>
                          <div><dt>Current decision</dt><dd>{statusLabel(chapter.storyteller_share_decision)}</dd></div>
                          <div><dt>Released</dt><dd>{compactTimestamp(latestRelease?.occurred_at ?? null)}</dd></div>
                          <div><dt>New review calls</dt><dd>{eligibleRevocationCalls.length} eligible</dd></div>
                        </dl>

                        <div className={`permission-ops-notice ${highImpact ? "tone-danger" : "tone-warning"}`} role="note">
                          <strong>
                            {paidOrder
                              ? `${moneyLabel(paidOrder.amount_cents)} finished result has been paid for.`
                              : chapter.status === "delivered"
                                ? "This result has already been delivered."
                                : "The sponsor can currently open this preview."}
                          </strong>
                          <p>
                            Revocation hides future StorySitting access immediately. It cannot retract a file
                            the sponsor already downloaded, and it does not automatically issue a refund.
                          </p>
                        </div>

                        {chapter.preview_excerpt ? (
                          <blockquote>
                            “{chapter.preview_excerpt}”
                            <small>Currently family-visible excerpt</small>
                          </blockquote>
                        ) : null}
                      </section>

                      <section className="permission-verification-form">
                        <div>
                          <p className="kicker">New storyteller instruction</p>
                          <h3>Remove current access</h3>
                          <p>
                            The selected managed call must have ended after the current family release.
                            The original release call cannot be reused to reverse its own decision.
                          </p>
                        </div>

                        {!latestRelease ? (
                          <div className="permission-call-gate" role="note">
                            <strong>Current release evidence is unavailable</strong>
                            <p>Reconcile the family-sharing ledger before using this control. The desk fails closed when it cannot establish the prior release time.</p>
                          </div>
                        ) : null}

                        <form action={recordStorytellerChapterRelease} className="permission-positive-form">
                          <input type="hidden" name="story_chapter_id" value={chapter.id} />

                          {eligibleRevocationCalls.length > 0 ? (
                            <label className="field">
                              <span>New completed storyteller-review call</span>
                              <select name="review_call_request_id" required defaultValue={eligibleRevocationCalls[0].id}>
                                {eligibleRevocationCalls.map((call) => (
                                  <option key={call.id} value={call.id}>
                                    Human story review · {compactTimestamp(call.ended_at ?? call.created_at)} · {callLength(call.duration_seconds)}
                                  </option>
                                ))}
                              </select>
                              <small>Only post-release calls with a managed provider reference are eligible.</small>
                            </label>
                          ) : (
                            <div className="permission-call-gate" role="note">
                              <strong>No new managed review call</strong>
                              <p>Speak directly with the storyteller through the managed line, end that call successfully, then return here.</p>
                            </div>
                          )}

                          <label className="field">
                            <span>New storyteller decision</span>
                            <select name="decision" required defaultValue="">
                              <option value="" disabled>Select the decision heard on the new call</option>
                              <option value="private">Keep this chapter private to the storyteller</option>
                              <option value="withheld">Withhold this chapter from any further delivery</option>
                            </select>
                          </label>

                          <label className="field">
                            <span>Operator revocation note</span>
                            <textarea
                              name="operator_notes"
                              minLength={20}
                              maxLength={1000}
                              required
                              placeholder="Record what the storyteller asked to change, their privacy instruction, and any follow-up the operations team owes them."
                            />
                          </label>

                          <div className="permission-attestations">
                            <label>
                              <input type="checkbox" name="storyteller_decision_confirmed" value="yes" required />
                              <span>I heard this new instruction directly from the storyteller on the selected managed call.</span>
                            </label>
                            <label>
                              <input type="checkbox" name="current_access_revocation_confirmed" value="yes" required />
                              <span>
                                I understand this immediately removes current sponsor access, including access to a paid or delivered result, without retracting prior downloads or automatically issuing a refund.
                              </span>
                            </label>
                          </div>

                          <button
                            className="permission-disposition-button"
                            type="submit"
                            disabled={eligibleRevocationCalls.length === 0}
                          >
                            Remove sponsor access now
                          </button>
                          <small className="permission-form-fineprint">
                            The database records a verified family-sharing revocation and makes the chapter fail its current-release access checks.
                          </small>
                        </form>
                      </section>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </main>
  );
}
