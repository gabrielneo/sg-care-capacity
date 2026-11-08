import { sparkPath } from "@/lib/status";

const W = 120;
const H = 32;

/**
 * Twelve weeks of a hospital's bed wait as a small line, drawn on the server (no chart library).
 * Decorative: the card states the numbers, so the line is hidden from screen readers. A missing
 * week is a gap; the last week is marked with a dot.
 */
export function Sparkline({ values, tone }: { values: (number | null)[]; tone: "bad" | "warn" | "ok" | "none" }) {
  const d = sparkPath(values, W, H, 3);
  if (!d) return <div className="h-8 w-[120px]" aria-hidden="true" />;
  const last = d.split(/[ML]/).filter(Boolean).at(-1)?.split(" ").map(Number);
  const colour = { bad: "text-bad", warn: "text-warn", ok: "text-ok", none: "text-muted" }[tone];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className={`shrink-0 ${colour}`} aria-hidden="true" data-testid="sparkline">
      <path d={d} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {last && values.at(-1) != null ? <circle cx={last[0]} cy={last[1]} r={3} fill="currentColor" /> : null}
    </svg>
  );
}
