import { drawLine, type LinePoint } from "@/lib/heroLine";

const W = 560;
const H = 220;

/**
 * The landing page's moving picture: the full EDs' monthly average bed wait, drawn in as the page loads, ending in a pulsing dot
 * on the latest month. One colour (the accent) for the line and its last point: no decorative gradient. The figures are the API's; a month that isn't complete is a gap in the line, never a point.
 */
export function HeroLine({ points, summary }: { points: LinePoint[]; summary: string }) {
  const line = drawLine(points, W, H);
  if (!line.last) return null;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} className="hero-line block h-auto w-full" data-testid="hero-line">
      <defs>
        <linearGradient id="hero-area" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--data-mark)" stopOpacity="0.2" />
          <stop offset="100%" stopColor="var(--data-mark)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {line.areas.map((d) => <path key={d} d={d} fill="url(#hero-area)" className="hero-area" />)}
      {line.paths.map((d) => (
        <path key={d} d={d} pathLength={1} fill="none" stroke="var(--data-mark)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="hero-stroke" />
      ))}
      {line.dots.map((p) => <circle key={`${p.x}`} cx={p.x} cy={p.y} r={3} fill="var(--data-mark)" />)}
      <circle cx={line.last.x} cy={line.last.y} r={7} fill="var(--data-mark)" className="hero-pulse" />
      <circle cx={line.last.x} cy={line.last.y} r={5} fill="var(--data-mark)" stroke="var(--bg-surface)" strokeWidth={2} />
    </svg>
  );
}
