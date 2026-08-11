const DEFAULT_BARS = [14, 24, 10, 32, 44, 22, 50, 28, 18, 40, 58, 34, 20, 46, 30, 16, 38, 52, 26, 42, 18, 30, 48, 24, 14];

export function StoryWave({ active = false, compact = false }: { active?: boolean; compact?: boolean }) {
  const bars = compact ? DEFAULT_BARS.slice(0, 17) : DEFAULT_BARS;
  return (
    <span className={`story-wave${active ? " is-active" : ""}`} aria-hidden="true">
      {bars.map((height, index) => (
        <i key={`${height}-${index}`} style={{ height: `${height}%`, animationDelay: `${index * 38}ms` }} />
      ))}
    </span>
  );
}
