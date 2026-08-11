import Image from "next/image";
import Link from "next/link";
import { getProfileRole, requireUser } from "@/lib/auth";
import { safeDate } from "@/lib/relations";
import {
  sponsorActionForStatus,
  sponsorStageForStatus,
  sponsorStatusFromEvidence
} from "@/lib/story-product";
import { SponsorTimeline } from "@/components/SponsorTimeline";
import { SponsorNextAction } from "@/components/SponsorNextAction";
import { StoryOfferLedger } from "@/components/StoryOfferLedger";

function actionLink(roomId: string, status?: string | null) {
  const kind = sponsorActionForStatus(status).kind;
  if (kind === "send_pass") return { href: `/story-rooms/${roomId}#permission-handoff`, label: "Open the Family Pass" };
  if (kind === "preview") return { href: `/story-rooms/${roomId}#private-preview`, label: "Hear the private preview" };
  if (kind === "question") return { href: `/story-rooms/${roomId}#question-queue`, label: "Add a family question" };
  if (kind === "result") return { href: `/story-rooms/${roomId}#finished-result`, label: "Open the kept result" };
  return { href: `/story-rooms/${roomId}`, label: "Open this story" };
}

export default async function DashboardPage() {
  const { supabase, user } = await requireUser();
  const role = await getProfileRole(user.id);

  const { data: accounts } = await supabase
    .from("customer_accounts")
    .select("id")
    .eq("owner_user_id", user.id);

  const accountIds = (accounts ?? []).map((account) => account.id);
  const { data: roomData } = accountIds.length
    ? await supabase
        .from("story_rooms")
        .select("id,title,subject_name,package_tier,production_status,created_at")
        .in("customer_account_id", accountIds)
        .order("created_at", { ascending: false })
    : { data: [] as Array<{ id: string; title: string; subject_name: string | null; package_tier: string | null; production_status: string | null; created_at: string }> };

  const rooms = roomData ?? [];
  const roomIds = rooms.map((room) => room.id);
  const { data: chapterData } = roomIds.length
    ? await supabase
        .from("story_chapters")
        .select("story_room_id,status,created_at")
        .in("story_room_id", roomIds)
        .order("created_at", { ascending: false })
    : { data: [] as Array<{ story_room_id: string; status: string | null; created_at: string }> };

  const latestChapterStatus = new Map<string, string | null>();
  for (const chapter of chapterData ?? []) {
    if (!latestChapterStatus.has(chapter.story_room_id)) latestChapterStatus.set(chapter.story_room_id, chapter.status);
  }

  const customerRooms = rooms.map((room) => ({
    ...room,
    effectiveStatus: sponsorStatusFromEvidence(room.production_status, {
      chapterStatus: latestChapterStatus.get(room.id)
    })
  }));
  const activeRooms = customerRooms.filter((room) => !["complete", "delivered", "archived"].includes(room.effectiveStatus ?? ""));
  const primaryRoom = activeRooms[0] ?? customerRooms[0] ?? null;
  const primaryStage = sponsorStageForStatus(primaryRoom?.effectiveStatus);
  const ownerName = user.user_metadata?.full_name?.split(" ")?.[0] || user.email?.split("@")[0] || "there";
  const primaryAction = primaryRoom ? actionLink(primaryRoom.id, primaryRoom.effectiveStatus) : null;

  return (
    <main className="shell shelf-page journey-dashboard">
      <section className="shelf-heading">
        <div>
          <p className="kicker">Your private Story Shelf</p>
          <h1>{primaryRoom ? `Here’s where ${primaryRoom.subject_name || "the story"} stands.` : `Welcome, ${ownerName}.`}</h1>
          <p>{primaryRoom ? "One truthful status. One useful next action. No mystery charge waiting in the background." : "Open one Story Start and follow the entire sitting from permission to a result worth keeping."}</p>
        </div>
        <div className="page-actions">
          {(role === "staff" || role === "admin") && <Link className="btn secondary" href="/staff">Production desk</Link>}
          <Link className="btn secondary" href="/start">Start another person · $5</Link>
        </div>
      </section>

      {primaryRoom ? (
        <section className="shelf-control-panel">
          <header className="shelf-project-folio">
            <div><span>Current story</span><small>Started {safeDate(primaryRoom.created_at)}</small></div>
            <h2>{primaryRoom.title}</h2>
            <p>{primaryRoom.subject_name || "Family storyteller"}</p>
            <dl>
              <div><dt>Privacy</dt><dd>Family controlled</dd></div>
              <div><dt>Current stage</dt><dd>{primaryStage.shortLabel}</dd></div>
              <div><dt>Recurring charge</dt><dd>$0</dd></div>
            </dl>
          </header>
          <div className="shelf-control-body">
            <SponsorNextAction
              status={primaryRoom.effectiveStatus}
              subject={primaryRoom.subject_name}
              href={primaryAction?.href}
              cta={primaryAction?.label}
            />
            <SponsorTimeline status={primaryRoom.effectiveStatus} compact />
            <p className="shelf-status-note"><strong>{primaryStage.label}.</strong> {primaryStage.description}</p>
          </div>
        </section>
      ) : (
        <section className="empty-shelf-card">
          <div className="empty-shelf-image"><Image src="/images/finished-story.webp" alt="A finished family story beside its source recording" fill sizes="(max-width: 800px) 100vw, 46vw" /></div>
          <div><p className="kicker">Your first shelf space</p><h2>Whose voice belongs here?</h2><p>$5 opens one trusted permission process. They use an ordinary telephone; you see every state change and hear a private preview before choosing Voice, Story, Heirloom, or nothing more.</p><Link className="btn" href="/start">Open a Story Start · $5</Link><Link className="btn secondary" href="/demo">See a finished example</Link></div>
        </section>
      )}

      {customerRooms.length > 0 && (
        <section className="shelf-library">
          <div className="between"><div><p className="kicker">Every Story Start</p><h2>Your family projects.</h2></div><span className="muted">{customerRooms.length} private {customerRooms.length === 1 ? "project" : "projects"}</span></div>
          <div className="shelf-project-list">
            {customerRooms.map((room, index) => {
              const stage = sponsorStageForStatus(room.effectiveStatus);
              const action = sponsorActionForStatus(room.effectiveStatus, room.subject_name || "your storyteller");
              return (
                <Link href={`/story-rooms/${room.id}`} className="shelf-project-row" key={room.id}>
                  <span className="project-number">{String(index + 1).padStart(2, "0")}</span>
                  <div className="project-name"><small>{room.subject_name || "Family storyteller"}</small><h3>{room.title}</h3></div>
                  <div className="project-state"><span>{stage.shortLabel}</span><p>{action.title}</p></div>
                  <span className="project-open">Open →</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section className="dashboard-offer-boundary">
        <div><p className="kicker">The commercial boundary</p><h2>You buy the beginning. They control the call. You buy permanence only after hearing the work.</h2></div>
        <StoryOfferLedger />
      </section>
    </main>
  );
}
