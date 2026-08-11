import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { absoluteUrl } from "@/lib/utils";
import {
  RESULT_OFFERS,
  resultOffer,
  resultUpgradeAmountCents,
  sponsorActionForStatus,
  sponsorStageForStatus,
  sponsorStatusFromEvidence
} from "@/lib/story-product";
import { SponsorTimeline } from "@/components/SponsorTimeline";
import { SponsorNextAction } from "@/components/SponsorNextAction";
import { StoryOfferLedger } from "@/components/StoryOfferLedger";
import { StoryWave } from "@/components/StoryWave";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { finishedDeliveryAssetsSchema } from "@/lib/story-product";
import {
  verifyFinishedDeliveryAttestation,
  verifyStoryDropPreviewAsset
} from "@/lib/story-delivery";
import { addFamilyQuestion, createInvite, requestStoryCorrection } from "./server-actions";
import { purchaseFinishedResult } from "./purchase-actions";

function displayStatus(value?: string | null) {
  return value?.replaceAll("_", " ") ?? "pending";
}

export default async function StoryRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireUser();

  const { data: room, error } = await supabase
    .from("story_rooms")
    .select("id,title,subject_name,package_tier,production_status,onboarding_data,sponsor_intake_id,created_at")
    .eq("id", id)
    .single();

  if (error || !room) {
    return <main className="shell"><section className="card"><p className="kicker">Private story</p><h1>Story not found.</h1><p>This project may have moved, or your account may not have access.</p><Link className="btn" href="/dashboard">Back to the Story Shelf</Link></section></main>;
  }

  const [inviteResult, contributionResult, callResult, consentResult, chapterResult, questionResult] = await Promise.all([
    supabase.from("invites").select("id,invite_token,email,phone,status,expires_at,created_at").eq("story_room_id", id).order("created_at", { ascending: false }),
    supabase.from("contributions").select("id,title,contribution_type,review_status,submitted_at").eq("story_room_id", id).order("submitted_at", { ascending: false }),
    supabase.from("call_requests").select("id,call_kind,status,scheduled_for,duration_seconds,outcome,created_at").eq("story_room_id", id).order("created_at", { ascending: false }),
    supabase.from("consent_events").select("id,consent_scope,decision,capture_method,verification_status,occurred_at").eq("story_room_id", id).order("occurred_at", { ascending: false }),
    supabase.from("story_chapters").select("id,title,preview_excerpt,status,storyteller_share_decision,people,places,eras,open_threads,created_at").eq("story_room_id", id).order("created_at", { ascending: false }),
    supabase.from("family_questions").select("id,question,context_note,status,submitted_by_name,created_at").eq("story_room_id", id).order("created_at", { ascending: false })
  ]);

  const invites = inviteResult.data ?? [];
  const contributions = contributionResult.data ?? [];
  const calls = callResult.data ?? [];
  const consents = consentResult.data ?? [];
  const chapters = chapterResult.data ?? [];
  const questions = questionResult.data ?? [];
  const latestChapter = chapters[0] ?? null;
  const latestCall = calls[0] ?? null;
  const subject = room.subject_name || "Your storyteller";
  const onboarding = (room.onboarding_data ?? {}) as { why_now?: string; known_materials?: string };
  const admin = createSupabaseAdminClient();
  const permissionScopes = ["contact", "ai_interview", "recording", "transcription", "editing", "family_sharing"];
  let permissionRequest: { public_token: string; family_code: string; status: string; expires_at: string } | null = null;
  let storyDropPreview: { storage_bucket: string; storage_path: string; duration_seconds: number; transcript_excerpt: string | null } | null = null;
  let delivery: { body: string; source_map: unknown; delivered_assets: unknown } | null = null;
  let previewAudioUrl: string | null = null;
  let fullRecordingUrl: string | null = null;
  let fullTranscriptUrl: string | null = null;
  let heirloomPdfUrl: string | null = null;
  let correction: { correction_type: string; request: string; status: string; resolution_note: string | null; created_at: string; correction_round: number | null } | null = null;
  let correctionCount = 0;
  let resultOrder: { result_offer_id: string | null; result_paid_total_cents: number | null; status: string } | null = null;
  let availableDeliveryAssets: unknown = null;

  if (room.sponsor_intake_id) {
    const { data } = await admin
      .from("storyteller_permission_requests")
      .select("public_token,family_code,status,expires_at")
      .eq("sponsor_intake_id", room.sponsor_intake_id)
      .in("status", ["pending", "identity_pending"])
      .maybeSingle();
    permissionRequest = data;
  }

  if (latestChapter) {
    const [previewLookup, orderLookup, correctionLookup] = await Promise.all([
      supabase.from("story_drop_previews").select("storage_bucket,storage_path,duration_seconds,transcript_excerpt").eq("story_chapter_id", latestChapter.id).maybeSingle(),
      supabase.from("orders").select("result_offer_id,result_paid_total_cents,status").eq("story_chapter_id", latestChapter.id).eq("order_type", "finished_result").maybeSingle(),
      supabase.from("story_corrections").select("correction_type,request,status,resolution_note,created_at,correction_round").eq("story_chapter_id", latestChapter.id).order("created_at", { ascending: false })
    ]);
    storyDropPreview = previewLookup.data;
    resultOrder = orderLookup.data;
    const corrections = correctionLookup.data ?? [];
    correction = corrections[0] ?? null;
    correctionCount = corrections.filter((item) => item.correction_round).length;

    const activeOffer = resultOffer(resultOrder?.status === "paid" ? resultOrder.result_offer_id : null);
    const { data: privateDelivery } = await admin
      .from("story_chapter_deliveries")
      .select("body,source_map,delivered_assets,verified_manifest_sha256,verified_at")
      .eq("story_chapter_id", latestChapter.id)
      .maybeSingle();
    if (privateDelivery && verifyFinishedDeliveryAttestation(id, privateDelivery)) {
      availableDeliveryAssets = privateDelivery.delivered_assets;
      if (activeOffer) {
        delivery = {
          body: activeOffer.id === "voice" ? "" : privateDelivery.body,
          source_map: activeOffer.id === "voice" ? [] : privateDelivery.source_map,
          delivered_assets: privateDelivery.delivered_assets
        };
      }
    }

    if (storyDropPreview && verifyStoryDropPreviewAsset(id, storyDropPreview)) {
      const { data: signedPreview } = await admin.storage
        .from(storyDropPreview.storage_bucket)
        .createSignedUrl(storyDropPreview.storage_path, 15 * 60);
      previewAudioUrl = signedPreview?.signedUrl ?? null;
    }
    if (delivery) {
      const parsedAssets = finishedDeliveryAssetsSchema.safeParse(delivery.delivered_assets);
      if (parsedAssets.success) {
        const [recordingResult, transcriptResult, heirloomResult] = await Promise.all([
          admin.storage.from(parsedAssets.data.recording.bucket).createSignedUrl(parsedAssets.data.recording.path, 15 * 60),
          admin.storage.from(parsedAssets.data.transcript.bucket).createSignedUrl(parsedAssets.data.transcript.path, 15 * 60),
          parsedAssets.data.heirloomPdf
            ? admin.storage.from(parsedAssets.data.heirloomPdf.bucket).createSignedUrl(parsedAssets.data.heirloomPdf.path, 15 * 60)
            : Promise.resolve({ data: null })
        ]);
        fullRecordingUrl = recordingResult.data?.signedUrl ?? null;
        fullTranscriptUrl = transcriptResult.data?.signedUrl ?? null;
        heirloomPdfUrl = heirloomResult.data?.signedUrl ?? null;
      }
    }
  }

  const activeOffer = resultOffer(resultOrder?.status === "paid" ? resultOrder.result_offer_id : null);
  const paidTotalCents = Number(resultOrder?.result_paid_total_cents ?? 0);
  const parsedDeliveryAssets = availableDeliveryAssets ? finishedDeliveryAssetsSchema.safeParse(availableDeliveryAssets) : null;
  const heirloomReady = Boolean(parsedDeliveryAssets?.success && parsedDeliveryAssets.data.heirloomPdf);
  const correctionRoundAvailable = Boolean(
    activeOffer &&
    activeOffer.correctionRounds > correctionCount &&
    (!correction || ["completed", "rejected"].includes(correction.status))
  );

  const effectiveStatus = sponsorStatusFromEvidence(room.production_status, {
    chapterStatus: latestChapter?.status,
    hasPaidDelivery: Boolean(activeOffer)
  });
  const stage = sponsorStageForStatus(effectiveStatus);
  const action = sponsorActionForStatus(effectiveStatus, subject);
  const sourceCount = Array.isArray(delivery?.source_map) ? delivery.source_map.length : 0;
  const actionDestination = permissionRequest
    ? { href: "#permission-handoff", label: "Send the Family Pass" }
    : action.kind === "preview"
      ? { href: "#private-preview", label: "Hear the private preview" }
      : action.kind === "question"
        ? { href: "#question-queue", label: "Add a family question" }
        : action.kind === "result"
          ? { href: "#finished-result", label: "Open the kept result" }
          : null;
  const latestQueuedQuestion = questions.find((question) => question.status === "queued")?.question;
  const repeatHref = `/start?returning=${encodeURIComponent(subject)}${latestQueuedQuestion ? `&seed=${encodeURIComponent(latestQueuedQuestion)}` : ""}`;

  return (
    <main className="shell story-detail-page">
      <div className="story-detail-nav"><Link href="/dashboard">← Story Shelf</Link><span>Private family story</span></div>

      <section className="story-record-header">
        <header>
          <div className="story-record-meta"><span>Story record</span><b>{stage.shortLabel}</b></div>
          <p>{subject}</p>
          <h1>{room.title}</h1>
          <blockquote>{onboarding.why_now || "One voice, one sitting, one finished story at a time."}</blockquote>
          <small>Private by default · storyteller controlled · no recurring charge</small>
        </header>
        <div className="story-record-control">
          <SponsorNextAction
            status={effectiveStatus}
            subject={subject}
            href={actionDestination?.href}
            cta={actionDestination?.label}
            {...(permissionRequest?.status === "identity_pending" ? {
              owner: "StorySitting",
              title: "We are verifying their response.",
              detail: `${subject} has answered the Family Pass. A human identity and permission check comes before scheduling.`
            } : {})}
          />
          <SponsorTimeline status={effectiveStatus} compact />
          <p className="story-record-stage"><strong>{stage.label}.</strong> {stage.description}</p>
        </div>
      </section>

      {permissionRequest ? (
        <section className="family-pass-return-card" id="permission-handoff">
          <div>
            <p className="kicker">Permission handoff</p>
            <h2>{permissionRequest.status === "identity_pending" ? "Their response is in human review." : "Send the Family Pass from your own phone."}</h2>
            <p>{permissionRequest.status === "identity_pending" ? `Nothing else is required from you. StorySitting is verifying ${subject}’s identity and choices before any sitting can be scheduled.` : `Send the private link and four-digit code in separate messages. ${subject} decides for themself; your $5 payment never stands in for consent.`}</p>
          </div>
          <div className="family-pass-return-code">
            <span>Family code</span>
            <strong>{permissionRequest.family_code}</strong>
            <small>{permissionRequest.status === "identity_pending" ? "Response received · human check pending" : "Waiting for their response"}</small>
          </div>
          <div className="family-pass-return-actions">
            <Link className="btn" href={`/permission/${permissionRequest.public_token}`}>Open private Family Pass</Link>
            <code>{absoluteUrl(`/permission/${permissionRequest.public_token}`)}</code>
          </div>
        </section>
      ) : null}

      {latestChapter ? (
        <section className={`story-drop-card${activeOffer ? " kept-story-result" : " private-story-preview"}`} id={activeOffer ? "finished-result" : "private-preview"}>
          <div className="story-drop-player">
            <span className="drop-label">{activeOffer ? `${activeOffer.name} · source kept` : "Private preview · hear it before choosing"}</span>
            {previewAudioUrl ? <audio controls preload="metadata" src={previewAudioUrl}>Your browser cannot play this private Story Drop.</audio> : <span className="preview-processing">Preview audio is in quality review</span>}
            <StoryWave active={Boolean(previewAudioUrl)} />
            <small>{storyDropPreview?.duration_seconds ? `${storyDropPreview.duration_seconds} seconds · representative private passage` : latestCall?.duration_seconds ? `${Math.round(latestCall.duration_seconds / 60)} minute sitting · source preserved` : "Source audio preserved"}</small>
          </div>
          <div className="story-drop-copy">
            <span>{activeOffer ? activeOffer.name : "Strongest authentic moment"}</span>
            <h2>{latestChapter.title}</h2>
            <p>{activeOffer?.id !== "voice" ? delivery?.body || latestChapter.preview_excerpt || storyDropPreview?.transcript_excerpt : latestChapter.preview_excerpt || storyDropPreview?.transcript_excerpt || "The voice is kept; the narrative layer remains optional."}</p>
            <div className="thread-chips">
              {[...(latestChapter.people ?? []), ...(latestChapter.places ?? []), ...(latestChapter.eras ?? []), ...(latestChapter.open_threads ?? [])].slice(0, 8).map((thread: string) => <span key={thread}>{thread}</span>)}
            </div>
            <div className="story-drop-actions"><span className="badge">Sharing: {displayStatus(latestChapter.storyteller_share_decision)}</span><span className="source-chip"><span>↗</span> {activeOffer?.id !== "voice" && delivery ? `${sourceCount} source-linked ${sourceCount === 1 ? "passage" : "passages"}` : "Original source preserved"}</span></div>
            {activeOffer ? (
              <>
                <div className="kept-result-boundary">
                  <span>{activeOffer.layer} layer · ${paidTotalCents / 100} paid in total</span>
                  <strong>{activeOffer.name} is kept—not rented.</strong>
                  <ul>{activeOffer.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
                </div>
                <div className="delivery-actions">
                  {fullRecordingUrl && <a className="btn" href={fullRecordingUrl}>Download full recording</a>}
                  {fullTranscriptUrl && <a className="btn secondary" href={fullTranscriptUrl}>Download transcript</a>}
                  {activeOffer.id === "heirloom" && heirloomPdfUrl && <a className="btn secondary" href={heirloomPdfUrl}>Download heirloom PDF</a>}
                </div>
                {activeOffer.correctionRounds > 0 && correction ? (
                  <div className="correction-status-card">
                    <span>Correction round {correction.correction_round ?? correctionCount} · {displayStatus(correction.status)}</span>
                    <strong>{displayStatus(correction.correction_type)}</strong>
                    <p>{correction.request}</p>
                    {correction.resolution_note && <small>{correction.resolution_note}</small>}
                  </div>
                ) : null}
                {correctionRoundAvailable && latestChapter.status === "delivered" ? (
                  <form action={requestStoryCorrection} className="correction-request-form">
                    <input type="hidden" name="story_room_id" value={id} />
                    <input type="hidden" name="story_chapter_id" value={latestChapter.id} />
                    <label>Use correction round {correctionCount + 1} of {activeOffer.correctionRounds}
                      <select name="correction_type" defaultValue="fact">
                        <option value="fact">Fact</option><option value="name">Name</option><option value="date">Date</option><option value="privacy">Privacy</option><option value="tone">Tone</option><option value="other">Other</option>
                      </select>
                    </label>
                    <label>What should we correct?<textarea name="request" required maxLength={2000} placeholder="Tell us the exact name, date, passage, or privacy change." /></label>
                    <button type="submit">Send correction round {correctionCount + 1}</button>
                    <small>Bundle the changes you know about into this request. {activeOffer.name} includes {activeOffer.correctionRounds === 1 ? "one correction round" : "two correction rounds total"}.</small>
                  </form>
                ) : null}
                <div className="result-edition-upgrades">
                  <span className="kicker">Add a layer only if it earns one</span>
                  <div className="result-edition-grid">
                    {RESULT_OFFERS.filter((offer) => offer.priceCents > activeOffer.priceCents).map((offer) => {
                      const unavailable = offer.id === "heirloom" && !heirloomReady;
                      const due = resultUpgradeAmountCents(offer.id, paidTotalCents);
                      return <article key={offer.id}><small>{offer.layer}</small><h3>{offer.name}</h3><b>${due / 100} upgrade</b><p>{offer.description}</p>{unavailable ? <span>Design files still in review</span> : <form action={purchaseFinishedResult}><input type="hidden" name="story_room_id" value={id} /><input type="hidden" name="story_chapter_id" value={latestChapter.id} /><input type="hidden" name="offer_id" value={offer.id} /><button type="submit">Add this layer · ${due / 100}</button></form>}</article>;
                    })}
                  </div>
                  {activeOffer.id === "heirloom" ? <p className="preview-pass-note">A bound copy starts at $89 plus shipping and is confirmed separately after the PDF is approved.</p> : null}
                </div>
              </>
            ) : latestChapter.status === "sponsor_preview" || latestChapter.status === "approved" ? (
              <div className="preview-decision">
                <div className="preview-boundary-grid">
                  <div><span>Already here · $0 more</span><strong>The meaningful preview</strong><p>A representative passage and excerpt—enough to judge the actual work, not a teaser that stops before the heart.</p></div>
                  <div><span>Optional · from $39</span><strong>Choose what becomes permanent</strong><p>Keep only the complete voice, add the finished story, or build the designed heirloom.</p></div>
                </div>
                <div className="result-edition-grid choose-edition-grid">
                  {RESULT_OFFERS.map((offer) => {
                    const unavailable = offer.id === "heirloom" && !heirloomReady;
                    return <article key={offer.id} className={offer.id === "story" ? "recommended" : ""}><small>{offer.layer}{offer.id === "story" ? " · most chosen" : ""}</small><h3>{offer.name}</h3><b>${offer.priceCents / 100}</b><p>{offer.description}</p><ul>{offer.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>{unavailable ? <span>Design files still in review</span> : <form action={purchaseFinishedResult}><input type="hidden" name="story_room_id" value={id} /><input type="hidden" name="story_chapter_id" value={latestChapter.id} /><input type="hidden" name="offer_id" value={offer.id} /><button type="submit">Choose {offer.name} · ${offer.priceCents / 100}</button></form>}</article>;
                  })}
                </div>
                <p className="preview-pass-note">Not ready to keep it? Do nothing. No edition charge is created. Start with Voice and upgrade later by paying only the difference.</p>
              </div>
            ) : null}
          </div>
        </section>
      ) : (
        <section className="waiting-drop-card">
          <div><span className="waiting-orbit" /><span className="waiting-orbit two" /><strong>{stage.shortLabel}</strong></div>
          <section><p className="kicker">Reserved for the private preview</p><h2>Nothing pretend is waiting here.</h2><p>After verified permission and a usable sitting, this space will hold a real, representative passage from the call. StorySitting asks for no edition payment before that proof exists.</p><Link className="btn secondary" href="/demo">See how a finished result works</Link></section>
        </section>
      )}

      <section className="story-tools-grid">
        <article className="story-tool-card permission-card">
          <div className="tool-card-head"><span className="tool-icon">✓</span><div><p className="kicker">Permission ledger</p><h3>Their choices, visible.</h3></div></div>
          <div className="permission-list">
            {permissionScopes.map((scope) => {
              const consent = consents.find((item) => item.consent_scope === scope && item.verification_status === "verified");
              const pendingEvidence = consents.some((item) => item.consent_scope === scope && item.verification_status === "pending");
              const label = consent ? displayStatus(consent.decision) : pendingEvidence ? "checking evidence" : "pending";
              return <div key={scope}><span>{displayStatus(scope)}</span><b className={consent?.decision === "granted" ? "granted" : consent?.decision === "declined" || consent?.decision === "revoked" ? "declined" : "pending"}>{label}</b></div>;
            })}
          </div>
          <p className="tool-note">The sponsor can request a Story Start. Only {subject} can grant or revoke these permissions.</p>
        </article>

        <article className="story-tool-card question-tool" id="question-queue">
          <div className="tool-card-head"><span className="tool-icon">?</span><div><p className="kicker">Question queue</p><h3>What should we ask next?</h3></div></div>
          <form action={addFamilyQuestion} className="stack">
            <input type="hidden" name="story_room_id" value={id} />
            <label>Question<input name="question" required placeholder="What did Grandma say when you proposed?" /></label>
            <label>Why your family is asking<input name="context_note" placeholder="We found the fair photo in the blue album…" /></label>
            <button type="submit">Add to the next sitting</button>
          </form>
          <div className="queued-questions">
            {questions.slice(0, 3).map((question) => <div key={question.id}><p>“{question.question}”</p><small>{displayStatus(question.status)}{question.submitted_by_name ? ` · ${question.submitted_by_name}` : ""}</small></div>)}
            {questions.length === 0 && <p className="tool-note">No questions queued yet. The best prompts usually come from a detail only family would recognize.</p>}
          </div>
        </article>

        <article className="story-tool-card family-tool">
          <div className="tool-card-head"><span className="tool-icon">+</span><div><p className="kicker">Family relay</p><h3>Invite one useful memory.</h3></div></div>
          <form action={createInvite} className="stack">
            <input type="hidden" name="story_room_id" value={id} />
            <label>Name<input name="display_name" placeholder="Daniel" /></label>
            <label>Email<input name="email" type="email" placeholder="daniel@example.com" /></label>
            <input name="phone" type="hidden" />
            <button type="submit">Create private invite</button>
          </form>
          <div className="invite-list">
            {invites.slice(0, 3).map((invite) => <div key={invite.id}><span>{invite.email || invite.phone || "Family contributor"}</span><b>{displayStatus(invite.status)}</b><code>{absoluteUrl(`/invite/${invite.invite_token}`)}</code></div>)}
            {invites.length === 0 && <p className="tool-note">Contributors can add a question, photograph, caption, or remembered detail. They cannot see anything else unless you share it.</p>}
          </div>
        </article>
      </section>

      <section className="source-material-section">
        <div className="between"><div><p className="kicker">Family source material</p><h2>Context that makes the next call better.</h2></div><span className="badge">{contributions.length} contributions</span></div>
        <div className="source-material-grid">
          {contributions.slice(0, 6).map((contribution) => <article key={contribution.id}><span>{displayStatus(contribution.contribution_type)}</span><h3>{contribution.title || "Untitled family memory"}</h3><small>{displayStatus(contribution.review_status)}</small></article>)}
          {contributions.length === 0 && <div className="source-empty"><strong>Start with one thing.</strong><p>A photograph, recipe card, family saying, question, or object is enough to make the interview more personal.</p></div>}
        </div>
      </section>

      {stage.id === "shelf" ? (
        <section className="repeat-sitting-panel">
          <div>
            <p className="kicker">The next sitting is never automatic</p>
            <h2>There is already another good question here.</h2>
            <p>{latestQueuedQuestion ? <>Your queue begins with “{latestQueuedQuestion}”</> : <>Add a question whenever your family notices the next loose thread.</>} Opening it as a sitting requires a new $5 Story Start, {subject}&apos;s fresh permission, and another deliberate edition choice only after its private preview.</p>
            <Link className="btn" href={repeatHref}>Start another sitting with {subject} · $5</Link>
          </div>
          <StoryOfferLedger compact />
        </section>
      ) : null}
    </main>
  );
}
