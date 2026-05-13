import Link from "next/link";
import type { ReactNode } from "react";

type Tone = "neutral" | "success" | "warning" | "danger" | "accent";

function toneClass(tone: Tone = "neutral") {
  return `tone-${tone}`;
}

export function PageShell({
  kicker,
  title,
  subtitle,
  children,
  actions
}: {
  kicker?: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <main className="shell stack">
      <section className="page-hero card">
        {kicker ? <p className="kicker">{kicker}</p> : null}
        <div className="page-hero-row">
          <div>
            <h1>{title}</h1>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {actions ? <div className="page-actions">{actions}</div> : null}
        </div>
      </section>
      {children}
    </main>
  );
}

export function RoleShell({
  role,
  currentMission,
  endGoal,
  children
}: {
  role: string;
  currentMission: string;
  endGoal: string;
  children: ReactNode;
}) {
  return (
    <section className="card role-shell">
      <p className="kicker">{role}</p>
      <h2>{currentMission}</h2>
      <p>{endGoal}</p>
      {children}
    </section>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  tone = "neutral"
}: {
  label: string;
  value: string | number;
  detail?: string;
  tone?: Tone;
}) {
  return (
    <article className={`metric-card ${toneClass(tone)}`}>
      <p className="kicker">{label}</p>
      <strong>{value}</strong>
      {detail ? <span>{detail}</span> : null}
    </article>
  );
}

export function ProgressBar({
  value,
  label
}: {
  value: number;
  label?: string;
}) {
  const safeValue = Math.max(0, Math.min(100, Math.round(value || 0)));
  return (
    <div className="progress-wrap" aria-label={label || `Progress ${safeValue}%`}>
      <div className="progress-label-row">
        {label ? <span>{label}</span> : <span>Progress</span>}
        <strong>{safeValue}%</strong>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${safeValue}%` }} />
      </div>
    </div>
  );
}

export function StatusBadge({
  children,
  tone = "neutral"
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  return <span className={`status-badge ${toneClass(tone)}`}>{children}</span>;
}

export function ChecklistPanel({
  title,
  items,
  emptyText = "No checklist items yet."
}: {
  title: string;
  items: { label: string; done?: boolean; detail?: string }[];
  emptyText?: string;
}) {
  return (
    <section className="card checklist-panel">
      <h2>{title}</h2>
      {items.length ? (
        <ul className="checklist-list">
          {items.map((item) => (
            <li key={item.label} className={item.done ? "is-done" : "is-open"}>
              <span className="check-dot">{item.done ? "✓" : "•"}</span>
              <div>
                <strong>{item.label}</strong>
                {item.detail ? <p>{item.detail}</p> : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p>{emptyText}</p>
      )}
    </section>
  );
}

export function EmptyState({
  title,
  body,
  actionHref,
  actionLabel
}: {
  title: string;
  body: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <section className="card empty-state">
      <p className="kicker">Nothing here yet</p>
      <h2>{title}</h2>
      <p>{body}</p>
      {actionHref && actionLabel ? (
        <Link className="btn" href={actionHref}>{actionLabel}</Link>
      ) : null}
    </section>
  );
}

export function NextActionPanel({
  title = "Next required action",
  action,
  why,
  href,
  cta = "Continue"
}: {
  title?: string;
  action: string;
  why?: string;
  href?: string;
  cta?: string;
}) {
  return (
    <section className="card next-action-panel">
      <p className="kicker">{title}</p>
      <h2>{action}</h2>
      {why ? <p>{why}</p> : null}
      {href ? <Link className="btn" href={href}>{cta}</Link> : null}
    </section>
  );
}

export function WorkflowTimeline({
  steps,
  currentStep
}: {
  steps: { key: string; label: string; detail?: string }[];
  currentStep?: string;
}) {
  const currentIndex = Math.max(0, steps.findIndex((step) => step.key === currentStep));
  return (
    <section className="card workflow-timeline">
      <p className="kicker">Capsule path</p>
      <ol>
        {steps.map((step, index) => {
          const state = index < currentIndex ? "complete" : index === currentIndex ? "current" : "upcoming";
          return (
            <li key={step.key} className={state}>
              <span>{index + 1}</span>
              <div>
                <strong>{step.label}</strong>
                {step.detail ? <p>{step.detail}</p> : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function StoryRoomSummary({
  title,
  subjectName,
  status,
  readiness,
  href
}: {
  title: string;
  subjectName?: string | null;
  status?: string | null;
  readiness?: number;
  href?: string;
}) {
  const content = (
    <article className="card story-room-summary">
      <div>
        <p className="kicker">Story Room</p>
        <h2>{title}</h2>
        {subjectName ? <p>{subjectName}</p> : null}
      </div>
      <div className="summary-meta">
        <StatusBadge tone="accent">{status?.replaceAll("_", " ") || "gathering"}</StatusBadge>
        {typeof readiness === "number" ? <ProgressBar value={readiness} label="Readiness" /> : null}
      </div>
    </article>
  );

  if (!href) return content;
  return <Link className="unstyled-link" href={href}>{content}</Link>;
}
