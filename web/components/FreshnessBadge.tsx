import { formatAsOf } from "@/lib/dates";
import { type Cadence, CADENCE_TEXT, freshness, type Level, THRESHOLDS } from "@/lib/freshness";

export const LEVEL_STYLE: Record<Level, string> = {
  green: "bg-ok-soft text-ok border-ok/30",
  amber: "bg-warn-soft text-warn border-warn/30",
  red: "bg-bad-soft text-bad border-bad/30",
  unknown: "bg-page text-muted border-line",
};

/** A shape per level, so the status is never colour alone. */
export const LEVEL_SYMBOL: Record<Level, string> = { green: "✓", amber: "!", red: "✕", unknown: "?" };

/**
 * Green / amber / red from the age of as_of, always with a text label (never colour alone). `source`
 * names the publisher when a figure shows one badge per source.
 */
export function FreshnessBadge({ asOf, cadence, now, source }: { asOf: string; cadence: Cadence; now?: Date; source?: string }) {
  const f = freshness(asOf, cadence, now);
  const text = `${source ? `${source}: ` : ""}${f.age ? `${f.label} · ${CADENCE_TEXT[cadence]}, ${f.age} old` : f.label}`;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${LEVEL_STYLE[f.level]}`}
      title={`Data as of ${formatAsOf(asOf, { withTime: cadence === "live" })}; ${THRESHOLDS[cadence].describe}`}
      data-level={f.level}
    >
      <span aria-hidden="true" className="h-2 w-2 rounded-full bg-current" />
      {text}
    </span>
  );
}
