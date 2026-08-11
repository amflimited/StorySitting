import Link from "next/link";
import { sponsorActionForStatus } from "@/lib/story-product";

export function SponsorNextAction({
  status,
  subject,
  href,
  cta,
  title,
  detail,
  owner
}: {
  status?: string | null;
  subject?: string | null;
  href?: string;
  cta?: string;
  title?: string;
  detail?: string;
  owner?: string;
}) {
  const action = sponsorActionForStatus(status, subject || "your storyteller");

  return (
    <section className={`sponsor-next-action action-${action.kind}`}>
      <div className="action-owner"><span>Next action</span><strong>{owner || action.owner}</strong></div>
      <div className="action-copy">
        <h3>{title || action.title}</h3>
        <p>{detail || action.detail}</p>
      </div>
      {href && cta ? <Link className="btn" href={href}>{cta} →</Link> : null}
    </section>
  );
}
