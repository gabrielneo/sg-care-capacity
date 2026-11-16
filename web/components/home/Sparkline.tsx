import { sparkDomain, sparkPath, sparkY } from "@/lib/status";

// The drawing's own units. The size on screen is the --spark-w / --spark-h tokens (styles/tokens.css): 96 by 28.
const W = 96;
const H = 28;
const PAD = 3;

const DOT = { much: "fill-status-much", higher: "fill-status-higher", usual: "fill-status-usual", lower: "fill-status-lower", none: "fill-muted" } as const;

/**
 * Twelve weeks of a bed wait as a small line, drawn on the server (no chart library).
 * Decorative: the card's badge carries the reading (lib/status.ts), so the line is hidden from
 * screen readers; it makes no claim about a trend of its own. A missing week is a gap; the last week is a dot in the status colour (the line itself is always the
 * secondary text colour). `band` shades the usual range (usualBand) on the line's own scale.
 */
export function Sparkline({ values, tone, band = null }: {
  values: (number | null)[]; tone: "much" | "higher" | "usual" | "lower" | "none"; band?: [number, number] | null }) {
  const domain = sparkDomain(values, band ?? []);
  const d = sparkPath(values, W, H, PAD, domain);
  if (!d || !domain) return <div className="h-spark w-spark shrink-0" aria-hidden="true" />;
  const last = d.split(/[ML]/).filter(Boolean).at(-1)?.split(" ").map(Number);
  const top = band ? sparkY(band[1], domain, H, PAD) : 0;
  const bottom = band ? sparkY(band[0], domain, H, PAD) : 0;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-spark w-spark shrink-0 text-muted" aria-hidden="true" data-testid="sparkline">
      {band ? (
        <rect x={0} y={top} width={W} height={Math.max(bottom - top, 1)} rx={2} className="fill-sunken" data-testid="sparkline-band" />
      ) : null}
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      {last && values.at(-1) != null ? <circle cx={last[0]} cy={last[1]} r={2.5} className={DOT[tone]} data-testid="sparkline-dot" /> : null}
    </svg>
  );
}
