import { sparkDomain, sparkPath, sparkY } from "@/lib/status";

const W = 120;
const H = 32;
const PAD = 3;

/**
 * Twelve weeks of a bed wait as a small line, drawn on the server (no chart library).
 * Decorative: the card states the numbers, so the line is hidden from screen readers. A missing
 * week is a gap; the last week is marked with a dot. `band` shades the usual range (lib/status.ts,
 * usualBand) on the line's own scale. Only a line above usual is coloured; the rest are grey.
 */
export function Sparkline({ values, tone, band = null }: {
  values: (number | null)[]; tone: "bad" | "warn" | "ok" | "none"; band?: [number, number] | null }) {
  const domain = sparkDomain(values, band ?? []);
  const d = sparkPath(values, W, H, PAD, domain);
  if (!d || !domain) return <div className="h-8 w-[120px] shrink-0" aria-hidden="true" />;
  const last = d.split(/[ML]/).filter(Boolean).at(-1)?.split(" ").map(Number);
  const colour = { bad: "text-bad", warn: "text-warn", ok: "text-muted", none: "text-muted" }[tone];
  const top = band ? sparkY(band[1], domain, H, PAD) : 0;
  const bottom = band ? sparkY(band[0], domain, H, PAD) : 0;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className={`shrink-0 ${colour}`} aria-hidden="true" data-testid="sparkline">
      {band ? (
        <rect x={0} y={top} width={W} height={Math.max(bottom - top, 1)} rx={2} className="fill-line/50" data-testid="sparkline-band" />
      ) : null}
      <path d={d} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {last && values.at(-1) != null ? <circle cx={last[0]} cy={last[1]} r={3} fill="currentColor" /> : null}
    </svg>
  );
}
