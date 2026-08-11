import { StoryWave } from "@/components/StoryWave";

const timeline = [
  { label: "$5 Story Start", detail: "Complete", state: "done" },
  { label: "Permission", detail: "Ray said yes", state: "done" },
  { label: "First sitting", detail: "31 minutes", state: "done" },
  { label: "Story Drop", detail: "Ready now", state: "current" }
];

export function ProductPhone() {
  return (
    <div className="phone-shell" aria-label="StorySitting iPhone app preview">
      <div className="phone-hardware">
        <div className="phone-island" />
        <div className="phone-screen">
          <div className="phone-status"><span>9:41</span><span>● ●●</span></div>
          <div className="app-topline">
            <span className="app-mini-mark">S</span>
            <span>My Story Shelf</span>
            <span className="app-avatar">M</span>
          </div>
          <div className="story-cover-mini">
            <div className="cover-stamp">Story Drop 01</div>
            <span className="cover-kicker">Grandpa Ray</span>
            <strong>The three slices<br />of cherry pie</strong>
            <p>Henry County Fair · 1964</p>
          </div>
          <div className="phone-player">
            <button type="button" tabIndex={-1} aria-label="Play story preview">▶</button>
            <div><StoryWave compact /><span>0:00 / 1:12</span></div>
          </div>
          <div className="phone-section-title"><strong>Where it stands</strong><span>4 of 7</span></div>
          <div className="phone-timeline">
            {timeline.map((item) => (
              <div className={item.state} key={item.label}>
                <i />
                <span><strong>{item.label}</strong><small>{item.detail}</small></span>
              </div>
            ))}
          </div>
          <button type="button" className="phone-primary" tabIndex={-1}>Open the Story Drop</button>
          <div className="phone-tabs"><span className="active">Shelf</span><span>Questions</span><span>Family</span></div>
        </div>
      </div>
      <div className="phone-shadow" />
    </div>
  );
}
