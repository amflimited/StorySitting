export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`brand-lockup${compact ? " brand-lockup-compact" : ""}`}>
      <span className="brand-symbol" aria-hidden="true">
        <svg viewBox="0 0 48 48" role="img">
          <path d="M9 13.5c5.2-2.8 10.2-2.8 15 0v24c-4.8-2.8-9.8-2.8-15 0v-24Z" />
          <path d="M39 13.5c-5.2-2.8-10.2-2.8-15 0v24c4.8-2.8 9.8-2.8 15 0v-24Z" />
          <path className="brand-wave" d="M14.5 24h2.5l1.4-4.5 2.4 9 2-6 2.4 3.2 1.7-5.2 2.2 8 1.8-4.5h2.6" />
        </svg>
      </span>
      <span className="brand-type">
        <strong>StorySitting</strong>
        {!compact && <small>Family stories, finished</small>}
      </span>
    </span>
  );
}
