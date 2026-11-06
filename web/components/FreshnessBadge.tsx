import { formatAsOf } from "@/lib/dates";
import { type Cadence, freshness, type Level, THRESHOLDS } from "@/lib/freshness";

const STYLE: Record<Level, string> = {
  green: "bg-ok-soft text-ok border-ok/30",
  amber: "bg-warn-soft text-warn border-warn/30",
  red: "bg-bad-soft text-bad border-bad/30",
  unknown: "bg-page text-muted border-line",
};

/** Green / amber / red from the age of as_of, always with a text label (never colour alone). */
export function FreshnessBadge({ asOf, cadence, now }: { asOf: string; cadence: Cadence; now?: Date }) {
  const f = freshness(asOf, cadence, now);
  const text = f.age ? `${f.label} · ${f.age} old` : f.label;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${STYLE[f.level]}`}
      title={`Data as of ${formatAsOf(asOf, { withTime: cadence === "live" })}; ${THRESHOLDS[cadence].describe}`}
      data-level={f.level}
    >
      <span aria-hidden="true" className="h-2 w-2 rounded-full bg-current" />
      {text}
    </span>
  );
}
