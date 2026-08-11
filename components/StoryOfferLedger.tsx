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
        <dt>Choose what to keep</dt>
        <dd><strong>$39+</strong><span>optional, once</span></dd>
        {!compact && <p>Voice is $39, the source-linked Story is $79, and the designed Heirloom is $149.</p>}
      </div>
      <div>
        <dt>Add a layer later</dt>
        <dd><strong>Δ only</strong><span>pay the difference</span></dd>
        {!compact && <p>Move from Voice to Story or Heirloom without buying the same source twice.</p>}
      </div>
    </dl>
  );
}
