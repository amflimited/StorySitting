import {
  SPONSOR_MILESTONES,
  sponsorMilestoneIndex,
  sponsorStageForStatus
} from "@/lib/story-product";

export function SponsorTimeline({
  status,
  compact = false,
  heading = "The whole sitting"
}: {
  status?: string | null;
  compact?: boolean;
  heading?: string;
}) {
  const activeIndex = sponsorMilestoneIndex(status);
  const currentStage = sponsorStageForStatus(status);
  const stopped = status === "permission_declined" || status === "closed";

  return (
    <section className={`sponsor-journey${compact ? " compact" : ""}`} aria-label="StorySitting progress">
      {!compact && (
        <header className="sponsor-journey-head">
          <div>
            <span>Process</span>
            <strong>{heading}</strong>
          </div>
          <p><b>{currentStage.shortLabel}</b> · {currentStage.description}</p>
        </header>
      )}
      <ol className="sponsor-timeline">
        {SPONSOR_MILESTONES.map((milestone, index) => {
          const state = index < activeIndex ? "complete" : index === activeIndex ? (stopped ? "stopped" : "current") : "future";
          return (
            <li className={state} key={milestone.id} aria-current={state === "current" || state === "stopped" ? "step" : undefined}>
              <span className="timeline-marker" aria-hidden="true">{state === "complete" ? "✓" : index + 1}</span>
              <div className="timeline-copy">
                <span className="timeline-owner">{milestone.owner}</span>
                <strong>{milestone.label}</strong>
                {!compact && <small>{milestone.description}</small>}
                {milestone.price && <em>{milestone.price}</em>}
              </div>
            </li>
          );
        })}
      </ol>
      {!compact && <p className="journey-footnote">No subscription. No automatic next call. Every additional sitting begins with a new $5 Story Start.</p>}
    </section>
  );
}
