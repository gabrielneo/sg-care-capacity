import { drawLine, lineTicks, type LinePoint } from "@/lib/heroLine";

const W = 560;
const H = 220;

/**
 * The full EDs' monthly average bed wait as one line, ending in a dot on the latest month (with `animate`, the landing page's
 * moving picture: drawn in as the page loads, the last dot pulsing). One colour (the accent) for the line and its last point: no decorative gradient. The figures are the API's; a month that isn't complete is a gap in the line, never a point.
 * A light scale (0 and round steps, in hours) so the line's height can be read: the gridlines are in the SVG, their labels in HTML
 * beside it, so they keep the type scale at every width instead of shrinking with the drawing. The labels are hidden from screen
 * readers: the chart's summary states the figures.
 */
export function MonthLine({ points, summary, animate = false, gradientId = "month-line-area" }: {
  points: LinePoint[]; summary: string;
  /** The landing page only: the line draws in and the last dot pulses (app/globals.css, .hero-*). Elsewhere it is still. */
  animate?: boolean;
  gradientId?: string;
}) {
  const line = drawLine(points, W, H);
  if (!line.last) return null;
  const ticks = lineTicks(line.top, H);
  return (
    <div className="flex gap-2">
    <div className="relative w-8 shrink-0 text-meta tabular-nums text-muted" aria-hidden="true" data-testid="hero-ticks">
      {ticks.map((t, i) => (
        <span key={t.value} className="absolute right-0 -translate-y-1/2 whitespace-nowrap" style={{ top: `${t.pct}%` }}>
          {t.value}{i === ticks.length - 1 ? " h" : ""}
        </span>
      ))}
    </div>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} className={`${animate ? "hero-line " : ""}block h-auto min-w-0 flex-1`} data-testid="hero-line">
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--data-mark)" stopOpacity="0.2" />
          <stop offset="100%" stopColor="var(--data-mark)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((t) => {
        const y = (t.pct / 100) * H;
        return <path key={t.value} d={`M0 ${y.toFixed(1)} H${W}`} stroke={t.value === 0 ? "var(--border-control)" : "var(--border-subtle)"} strokeWidth={1} />;
      })}
      {line.areas.map((d) => <path key={d} d={d} fill={`url(#${gradientId})`} className={animate ? "hero-area" : undefined} />)}
      {line.paths.map((d) => (
        <path key={d} d={d} pathLength={1} fill="none" stroke="var(--data-mark)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className={animate ? "hero-stroke" : undefined} />
      ))}
      {line.dots.map((p) => <circle key={`${p.x}`} cx={p.x} cy={p.y} r={3} fill="var(--data-mark)" />)}
      {animate ? <circle cx={line.last.x} cy={line.last.y} r={7} fill="var(--data-mark)" className="hero-pulse" /> : null}
      <circle cx={line.last.x} cy={line.last.y} r={5} fill="var(--data-mark)" stroke="var(--bg-surface)" strokeWidth={2} />
    </svg>
    </div>
  );
}
