import type { Hospital, Insight } from "@/lib/api/types";
import type { BandPoint, DayValue, Mode } from "@/lib/edCompare";
import { pinnedCaveat } from "@/lib/hospitalNotes";
import { colors } from "@/lib/palette";

import { CaveatChip } from "../CaveatChip";
import { Glossed } from "../terms/Glossed";
import { Term } from "../terms/Term";
import { hours, shortDay, signed } from "./format";

export interface Panel {
  hospital: Hospital;
  series: DayValue[];
  /** "vs usual" mode only: why this hospital has no line (too few complete weeks). */
  missingUsual: string | null;
}

const H = 110;
const PAD = 8;

/** Runs of consecutive non-null values: a missing day breaks the line (never joined, never filled). */
function runs<T>(xs: T[], has: (x: T) => boolean): { start: number; items: T[] }[] {
  const out: { start: number; items: T[] }[] = [];
  xs.forEach((x, i) => {
    if (!has(x)) return;
    const last = out.at(-1);
    if (last && last.start + last.items.length === i) last.items.push(x);
    else out.push({ start: i, items: [x] });
  });
  return out;
}

/**
 * Small multiples: one panel per hospital, all on the same scale, each over the shaded band of the
 * full EDs (their middle half each day) and its median. Server-rendered SVG, stretched to the panel
 * width (viewBox x 0-100); lines keep their thickness; the labels are HTML so text never stretches.
 */
export function SmallMultiples({ panels, bandPoints, mode, finding }: {
  panels: Panel[]; bandPoints: BandPoint[]; mode: Mode; finding: Insight | null }) {
  const n = bandPoints.length;
  const all = [...panels.flatMap((p) => p.series.map((d) => d.value)), ...bandPoints.flatMap((b) => [b.p25, b.p75])]
    .filter((v): v is number => v != null);
  let lo = Math.min(...all, mode === "usual" ? 0 : Infinity);
  let hi = Math.max(...all, mode === "usual" ? 0 : -Infinity);
  if (mode === "raw") lo = Math.min(lo, 0);
  if (hi === lo) hi = lo + 1;
  const x = (i: number) => (n > 1 ? (100 * i) / (n - 1) : 50);
  const y = (v: number) => PAD + ((hi - v) / (hi - lo)) * (H - 2 * PAD);
  const fmt = (v: number) => (mode === "raw" ? hours(v) : signed(v));
  const bandRuns = runs(bandPoints, (b) => b.p25 != null && b.p75 != null);
  const first = bandPoints[0]?.date;
  const last = bandPoints.at(-1)?.date;

  return (
    <div>
      <ul className="grid gap-x-4 gap-y-5 sm:grid-cols-2 lg:grid-cols-3" data-testid="small-multiples">
        {panels.map(({ hospital, series, missingUsual }) => {
          const code = hospital.hospital_code;
          const annotated = finding?.entity === code;
          const lineRuns = runs(series, (d) => d.value != null);
          const gaps = series.filter((d) => d.value == null).length;
          const lastValue = [...series].reverse().find((d) => d.value != null);
          const note = pinnedCaveat(hospital);
          return (
            <li key={code} data-testid="multiple" data-hospital={code} data-annotated={annotated ? "" : undefined}
                className={`rounded-md border p-2 ${annotated ? "border-accent" : "border-line"}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
                <span className="font-medium text-ink"><Term id={code.toLowerCase()} /></span>
                {lastValue?.value != null ? (
                  <span className="text-xs tabular-nums text-muted">
                    {shortDay(lastValue.date)}: {fmt(lastValue.value)} {mode === "raw" ? "hours" : "hours vs usual"}
                  </span>
                ) : null}
              </div>
              {mode === "raw" && note ? (
                <div className="mt-1" data-testid="pinned-caveat"><CaveatChip><Glossed text={note} /></CaveatChip></div>
              ) : null}
              {annotated && finding?.chart ? (
                <p className="mt-1 text-xs font-medium text-ink" data-testid="chart-callout">
                  <span aria-hidden="true">↘ </span>{finding.chart.callout}
                </p>
              ) : null}
              {missingUsual ? (
                <p className="mt-2 flex h-[110px] items-center justify-center rounded bg-page px-2 text-center text-xs text-muted">{missingUsual}</p>
              ) : (
                <div className="relative mt-1">
                  <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" width="100%" height={H} aria-hidden="true" className="block">
                    {bandRuns.map((r) => (
                      <polygon key={`b${r.start}`} fill={colors.line} fillOpacity={0.55} data-testid="band"
                               points={[...r.items.map((b, k) => `${x(r.start + k)},${y(b.p75 as number)}`),
                                        ...[...r.items].reverse().map((b, k) => `${x(r.start + r.items.length - 1 - k)},${y(b.p25 as number)}`)].join(" ")} />
                    ))}
                    {runs(bandPoints, (b) => b.p50 != null).map((r) => (
                      <polyline key={`m${r.start}`} fill="none" stroke={colors.muted} strokeWidth={1} strokeDasharray="3 3"
                                vectorEffect="non-scaling-stroke" points={r.items.map((b, k) => `${x(r.start + k)},${y(b.p50 as number)}`).join(" ")} />
                    ))}
                    {mode === "usual" ? (
                      <line x1={0} x2={100} y1={y(0)} y2={y(0)} stroke={colors.ink} strokeWidth={1} vectorEffect="non-scaling-stroke" />
                    ) : null}
                    {lineRuns.map((r) => (
                      <polyline key={`l${r.start}`} fill="none" stroke={colors.accent} strokeWidth={1.75} vectorEffect="non-scaling-stroke"
                                data-testid="series" points={r.items.map((d, k) => `${x(r.start + k)},${y(d.value as number)}`).join(" ")} />
                    ))}
                  </svg>
                  <span className="absolute left-0 top-0 text-[10px] tabular-nums text-muted">{fmt(hi)}</span>
                  <span className="absolute bottom-0 left-0 text-[10px] tabular-nums text-muted">{fmt(lo)}</span>
                  {mode === "usual" ? (
                    <span className="absolute right-0 text-[10px] text-ink" style={{ top: Math.max(y(0) - 12, 0) }}>usual</span>
                  ) : null}
                </div>
              )}
              <p className="sr-only">
                {hospital.hospital_name}: {lastValue?.value != null ? `latest ${fmt(lastValue.value)} hours${mode === "usual" ? " vs its usual level" : ""}` : "no figures"}
                {gaps ? `, ${gaps} days missing` : ""}.
              </p>
              <p className="mt-1 flex justify-between text-[10px] text-muted" aria-hidden="true">
                <span>{first ? shortDay(first) : ""}</span>
                {gaps ? <span data-testid="gap-count">{gaps} {gaps === 1 ? "day" : "days"} missing</span> : null}
                <span>{last ? shortDay(last) : ""}</span>
              </p>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted" data-testid="band-legend">
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="inline-block h-0.5 w-5 bg-accent" />This hospital</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="inline-block h-3 w-5 bg-line" />
          Middle half of the full emergency departments each day, with their median (dashed)</span>
        {mode === "usual" ? <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="inline-block h-px w-5 bg-ink" />Usual level (0)</span> : null}
      </p>
    </div>
  );
}
