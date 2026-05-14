import { productVisualsFor, STORYSITTING_PRODUCT_VISUALS } from "@/lib/product-visuals";

export function ProductVisualPanel({
  keys,
  title = "The voice, the story, and the finished keepsake.",
  intro = "StorySitting produces a real family memory experience: something to hear, hold, share, and revisit."
}: {
  keys?: string[];
  title?: string;
  intro?: string;
}) {
  const visuals = keys?.length ? productVisualsFor(keys) : STORYSITTING_PRODUCT_VISUALS.slice(0, 3);

  return (
    <section className="card stack product-visual-panel">
      <div>
        <p className="kicker">End product</p>
        <h2>{title}</h2>
        <p>{intro}</p>
      </div>
      <div className="product-visual-grid">
        {visuals.map((visual) => (
          <article key={visual.key} className="product-visual-card">
            <img src={visual.src} alt={visual.title} />
            <div>
              <strong>{visual.title}</strong>
              <p>{visual.description}</p>
              <span>{visual.bestUse}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
