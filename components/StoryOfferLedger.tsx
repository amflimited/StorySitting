export function StoryOfferLedger({ compact = false }: { compact?: boolean }) {
  return (
    <dl className={`story-offer-ledger${compact ? " compact" : ""}`} aria-label="StorySitting price and decision points">
      <div>
        <dt>Open the process</dt>
        <dd><strong>$5</strong><span>one Story Start</span></dd>
        {!compact && <p>Funds the trusted permission setup and first outreach work.</p>}
      </div>
      <div>
        <dt>Hear the work</dt>
        <dd><strong>$0</strong><span>additional</span></dd>
        {!compact && <p>After an authorized sitting, hear a real private preview before deciding.</p>}
      </div>
      <div>
        <dt>Keep the result</dt>
        <dd><strong>$79</strong><span>optional, once</span></dd>
        {!compact && <p>Unlock the full recording, transcript, source-linked chapter, and correction pass.</p>}
      </div>
    </dl>
  );
}
