import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { finishedDeliveryAssetsSchema, isFinishedDeliveryReady } from "@/lib/story-product";
import {
  finalizeFinishedDelivery,
  invalidateFinishedDelivery
} from "./server-actions";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type DeliveryRow = {
  story_chapter_id: string;
  body: string;
  source_map: unknown;
  delivered_assets: unknown;
  verified_manifest_sha256: string | null;
  verified_at: string | null;
  verified_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

type ChapterRow = {
  id: string;
  story_room_id: string;
  title: string;
  status: string;
  storyteller_share_decision: string;
};

type RoomRow = {
  id: string;
  title: string;
  subject_name: string | null;
};

const resultMessages: Record<string, { tone: string; title: string; body: string }> = {
  verified: {
    tone: "tone-success",
    title: "Package verified",
    body: "Every declared asset matched its byte count and SHA-256. The immutable manifest attestation is now recorded."
  },
  invalidated: {
    tone: "tone-warning",
    title: "Attestation invalidated",
    body: "The verification fields are clear. The package may now be replaced, then it must pass the full storage audit again."
  },
  invalid: {
    tone: "tone-danger",
    title: "Audit confirmation missing",
    body: "Select the explicit audit confirmation and try again. No files were read."
  },
  invalidate_invalid: {
    tone: "tone-danger",
    title: "Invalidation confirmation missing",
    body: "Select the explicit invalidation confirmation before clearing a package attestation."
  },
  mismatch: {
    tone: "tone-danger",
    title: "Chapter and room do not match",
    body: "The request did not resolve to one staff-visible chapter in the stated Story Room. Nothing changed."
  },
  missing: {
    tone: "tone-danger",
    title: "Delivery not found",
    body: "The delivery row no longer exists or is not staff-visible. Nothing changed."
  },
  not_released: {
    tone: "tone-warning",
    title: "Storyteller release required",
    body: "The finished package can be audited only after the storyteller has released this chapter to family."
  },
  not_ready: {
    tone: "tone-warning",
    title: "Package is incomplete",
    body: "Finish the story body, source map, and valid asset manifest before running the expensive storage audit."
  },
  already_attested: {
    tone: "tone-warning",
    title: "Package already has attestation state",
    body: "Do not overwrite an attestation. Invalidate it first, make the intended changes, then run a fresh audit."
  },
  not_attested: {
    tone: "tone-warning",
    title: "Package is already unverified",
    body: "There was no attestation state to clear."
  },
  changed: {
    tone: "tone-warning",
    title: "Package changed during the audit",
    body: "No attestation was written. Review the current package and run a new audit from the beginning."
  },
  storage_failed: {
    tone: "tone-danger",
    title: "Storage audit failed",
    body: "At least one object was missing, outside the approved room path, the wrong size, or the wrong SHA-256. No attestation was written."
  },
  failed: {
    tone: "tone-danger",
    title: "Verification could not be saved",
    body: "The package was not attested. Check the database connection and retry only after reviewing the case."
  },
  invalidate_failed: {
    tone: "tone-danger",
    title: "Attestation could not be cleared",
    body: "Treat this package as locked until the invalidation can be confirmed in the database."
  }
};

function formatTimestamp(value: string | null) {
  if (!value) return "Not recorded";
  return `${value.slice(0, 10)} · ${value.slice(11, 16)} UTC`;
}

function formatBytes(bytes: number) {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function friendlyStatus(value: string) {
  return value.replaceAll("_", " ");
}

export default async function StaffDeliveriesPage({
  searchParams
}: {
  searchParams?: Promise<{ result?: string; chapter?: string }>;
}) {
  const { supabase } = await requireStaff();
  const query = searchParams ? await searchParams : {};

  const { data: deliveryData, error: deliveryError } = await supabase
    .from("story_chapter_deliveries")
    .select(
      "story_chapter_id,body,source_map,delivered_assets,verified_manifest_sha256,verified_at,verified_by_user_id,created_at,updated_at"
    )
    .order("updated_at", { ascending: false })
    .limit(100);

  const deliveries = (deliveryData ?? []) as DeliveryRow[];
  const chapterIds = deliveries.map((delivery) => delivery.story_chapter_id);
  let chapters: ChapterRow[] = [];
  let rooms: RoomRow[] = [];
  let relationError = false;

  if (!deliveryError && chapterIds.length > 0) {
    const chapterResult = await supabase
      .from("story_chapters")
      .select("id,story_room_id,title,status,storyteller_share_decision")
      .in("id", chapterIds);

    if (chapterResult.error) {
      relationError = true;
    } else {
      chapters = (chapterResult.data ?? []) as ChapterRow[];
      const roomIds = [...new Set(chapters.map((chapter) => chapter.story_room_id))];
      if (roomIds.length > 0) {
        const roomResult = await supabase
          .from("story_rooms")
          .select("id,title,subject_name")
          .in("id", roomIds);
        if (roomResult.error) relationError = true;
        else rooms = (roomResult.data ?? []) as RoomRow[];
      }
    }
  }

  const chapterById = new Map(chapters.map((chapter) => [chapter.id, chapter]));
  const roomById = new Map(rooms.map((room) => [room.id, room]));
  const awaiting = deliveries.filter(
    (delivery) => !(delivery.verified_manifest_sha256 && delivery.verified_at)
  );
  const verified = deliveries.filter(
    (delivery) => Boolean(delivery.verified_manifest_sha256 && delivery.verified_at)
  );
  const notice = query.result ? resultMessages[query.result] : null;
  const loadFailed = Boolean(deliveryError || relationError);

  return (
    <main className="shell stack">
      <section className="card stack">
        <div className="between">
          <div>
            <p className="kicker">Finished-delivery desk</p>
            <h1>Prove the package before it can be sold.</h1>
            <p>
              This is a one-time, expensive audit. It downloads every declared private asset,
              checks its byte count and SHA-256, and records the manifest digest used by the
              customer purchase path.
            </p>
          </div>
          <Link className="btn secondary" href="/staff">Back to Mission Control</Link>
        </div>
        <div className="mini-card tone-warning">
          <strong>Keep this out of Checkout and webhooks.</strong>
          <p>
            Run it only after the body, source map, recording, transcript, and optional archive
            are final. To replace anything later, invalidate the attestation first and audit the
            complete package again.
          </p>
        </div>
      </section>

      {notice ? (
        <section className={`card ${notice.tone}`} role="status">
          <strong>{notice.title}</strong>
          <p>{notice.body}</p>
        </section>
      ) : null}

      {loadFailed ? (
        <section className="card tone-danger">
          <h2>The delivery queue could not be loaded.</h2>
          <p>No audit or invalidation controls are shown until every required relation is readable.</p>
        </section>
      ) : null}

      {!loadFailed ? (
        <section className="card stack">
          <div className="between">
            <div>
              <p className="kicker">Awaiting verification</p>
              <h2>{awaiting.length} package{awaiting.length === 1 ? "" : "s"} in the audit queue</h2>
            </div>
            <span className="badge strong">Expensive manual operation</span>
          </div>

          {awaiting.length === 0 ? (
            <div className="mini-card tone-success">
              <strong>Queue clear</strong>
              <p>No finished-delivery package is waiting for storage verification.</p>
            </div>
          ) : null}

          {awaiting.map((delivery) => {
            const chapter = chapterById.get(delivery.story_chapter_id);
            const room = chapter ? roomById.get(chapter.story_room_id) : undefined;
            const parsedAssets = finishedDeliveryAssetsSchema.safeParse(delivery.delivered_assets);
            const sourceCount = Array.isArray(delivery.source_map) ? delivery.source_map.length : 0;
            const bodyReady = delivery.body.trim().length > 0;
            const sourceReady = sourceCount > 0;
            const assetsReady = parsedAssets.success;
            const relationReady = Boolean(chapter && room && chapter.story_room_id === room.id);
            const releaseReady = Boolean(
              chapter?.storyteller_share_decision === "family" &&
              ["sponsor_preview", "approved", "delivered"].includes(chapter.status)
            );
            const attestationClear = !(
              delivery.verified_manifest_sha256 ||
              delivery.verified_at ||
              delivery.verified_by_user_id
            );
            const packageReady = isFinishedDeliveryReady(delivery);
            const canAudit =
              relationReady && releaseReady && attestationClear && packageReady;

            return (
              <article className="mini-card stack" id={`delivery-${delivery.story_chapter_id}`} key={delivery.story_chapter_id}>
                <div className="between">
                  <div>
                    <p className="kicker">{room?.title ?? "Unresolved Story Room"}</p>
                    <h3>{chapter?.title ?? "Unresolved chapter"}</h3>
                    <p>
                      {room?.subject_name || "No storyteller label"} · Chapter {chapter?.status ? friendlyStatus(chapter.status) : "missing"}
                    </p>
                  </div>
                  <span className={`badge ${canAudit ? "strong" : ""}`}>
                    {canAudit ? "Ready for audit" : "Blocked"}
                  </span>
                </div>

                <div className="grid">
                  <div className={`mini-card ${bodyReady ? "tone-success" : "tone-danger"}`}>
                    <strong>{bodyReady ? "✓" : "×"} Story body</strong>
                    <p>{bodyReady ? `${delivery.body.trim().length.toLocaleString()} characters ready` : "A non-empty final body is required."}</p>
                  </div>
                  <div className={`mini-card ${sourceReady ? "tone-success" : "tone-danger"}`}>
                    <strong>{sourceReady ? "✓" : "×"} Source map</strong>
                    <p>{sourceReady ? `${sourceCount} source entr${sourceCount === 1 ? "y" : "ies"}` : "At least one source entry is required."}</p>
                  </div>
                  <div className={`mini-card ${assetsReady ? "tone-success" : "tone-danger"}`}>
                    <strong>{assetsReady ? "✓" : "×"} Asset manifest</strong>
                    <p>{assetsReady ? "Recording and transcript metadata are structurally valid." : "The finished asset manifest is invalid."}</p>
                  </div>
                  <div className={`mini-card ${relationReady && releaseReady ? "tone-success" : "tone-danger"}`}>
                    <strong>{relationReady && releaseReady ? "✓" : "×"} Release boundary</strong>
                    <p>
                      {!relationReady
                        ? "Chapter-to-room relation could not be proven."
                        : releaseReady
                          ? "Storyteller released this chapter to family."
                          : `Share decision: ${friendlyStatus(chapter?.storyteller_share_decision ?? "missing")}.`}
                    </p>
                  </div>
                </div>

                {parsedAssets.success ? (
                  <table>
                    <thead>
                      <tr><th>Asset</th><th>Private object</th><th>Declared size</th><th>SHA-256</th></tr>
                    </thead>
                    <tbody>
                      {Object.entries(parsedAssets.data).map(([kind, asset]) => (
                        <tr key={kind}>
                          <td>{friendlyStatus(kind)}</td>
                          <td><code>{asset.bucket}/{asset.path}</code></td>
                          <td>{formatBytes(asset.bytes)}</td>
                          <td><code>{asset.sha256.slice(0, 12)}…{asset.sha256.slice(-8)}</code></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}

                {!attestationClear ? (
                  <div className="mini-card tone-warning">
                    <strong>Partial attestation state detected.</strong>
                    <p>Invalidate the partial state before this package can enter a fresh audit.</p>
                    {chapter && room ? (
                      <form className="stack" action={invalidateFinishedDelivery}>
                        <input type="hidden" name="story_chapter_id" value={chapter.id} />
                        <input type="hidden" name="story_room_id" value={room.id} />
                        <label>
                          <input required type="checkbox" name="invalidate_confirmation" value="yes" />{" "}
                          I understand this clears the current verification state before any package edit.
                        </label>
                        <button type="submit">Invalidate partial attestation</button>
                      </form>
                    ) : null}
                  </div>
                ) : null}

                {chapter && room && attestationClear ? (
                  <form className="stack" action={finalizeFinishedDelivery}>
                    <input type="hidden" name="story_chapter_id" value={chapter.id} />
                    <input type="hidden" name="story_room_id" value={room.id} />
                    <label>
                      <input required type="checkbox" name="audit_confirmation" value="yes" />{" "}
                      I confirm this package is final and authorize a one-time full download and SHA-256 audit.
                    </label>
                    <button disabled={!canAudit} type="submit">
                      {canAudit ? "Run full storage audit" : "Resolve every blocked check first"}
                    </button>
                  </form>
                ) : null}
              </article>
            );
          })}
        </section>
      ) : null}

      {!loadFailed && verified.length > 0 ? (
        <section className="card stack">
          <div>
            <p className="kicker">Verified packages</p>
            <h2>Attested and locked for purchase</h2>
            <p>Invalidation is the required first step before replacing any manifest or delivery asset.</p>
          </div>
          <table>
            <thead>
              <tr><th>Chapter</th><th>Verified</th><th>Manifest digest</th><th>Before editing</th></tr>
            </thead>
            <tbody>
              {verified.map((delivery) => {
                const chapter = chapterById.get(delivery.story_chapter_id);
                const room = chapter ? roomById.get(chapter.story_room_id) : undefined;
                if (!chapter || !room) return null;
                return (
                  <tr id={`delivery-${delivery.story_chapter_id}`} key={delivery.story_chapter_id}>
                    <td>
                      <strong>{chapter.title}</strong><br />
                      <Link href={`/staff/story-rooms/${room.id}`}>{room.title}</Link>
                    </td>
                    <td>
                      {formatTimestamp(delivery.verified_at)}<br />
                      <span className="muted">By {delivery.verified_by_user_id ?? "deleted staff account"}</span>
                    </td>
                    <td><code>{delivery.verified_manifest_sha256}</code></td>
                    <td>
                      <form className="stack" action={invalidateFinishedDelivery}>
                        <input type="hidden" name="story_chapter_id" value={chapter.id} />
                        <input type="hidden" name="story_room_id" value={room.id} />
                        <label>
                          <input required type="checkbox" name="invalidate_confirmation" value="yes" />{" "}
                          Clear attestation before edits
                        </label>
                        <button type="submit">Invalidate attestation</button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ) : null}
    </main>
  );
}
