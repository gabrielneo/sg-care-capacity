import type { Hospital, Insight } from "@/lib/api/types";
import { type Annotation, placeAnnotations } from "@/lib/annotations";
import type { BandPoint, DayValue, Mode } from "@/lib/edCompare";
import { pinnedCaveat } from "@/lib/hospitalNotes";
import { cssColors as colors } from "@/lib/palette";
import { HospitalName } from "@/components/HospitalName";

import { CaveatChip } from "../CaveatChip";
import { Glossed } from "../terms/Glossed";
import { hours, shortDay, signed } from "./format";

export interface Panel {
  hospital: Hospital;
  series: DayValue[];
  /** "vs usual" mode only: why this hospital has no line (too few complete weeks). */
  missingUsual: string | null;
  /** A 95% interval around each day, only when the API supplies one; never computed here. */
  ci?: { date: string; lo: number | null; hi: number | null }[];
}

const H = 110;
const PAD = 8;

/** The "no data" hatch: thin diagonal lines in the axis colour, never a fill that looks like a value. */
const HATCH = (id: string) => (
  <pattern id={id} width={4} height={4} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <line x1={0} y1={0} x2={0} y2={4} stroke={colors.control} strokeWidth={1} />
  </pattern>
);

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
/** Panels a phone shows before "Show all". */
export const PHONE_PANELS = 4;

export function SmallMultiples({ panels, bandPoints, mode, finding, annotations = [], annotationSource = null }: {
  panels: Panel[]; bandPoints: BandPoint[]; mode: Mode; finding: Insight | null; annotations?: Annotation[];
  /** Where the marked days come from and when (they are a different source from the chart's own). */
  annotationSource?: string | null }) {
  const n = bandPoints.length;
  const all = [...panels.flatMap((p) => p.series.map((d) => d.value)), ...bandPoints.flatMap((b) => [b.p25, b.p75])]
    .filter((v): v is number => v != null);
  let lo = Math.min(...all, mode === "usual" ? 0 : Infinity);
  let hi = Math.max(...all, mode === "usual" ? 0 : -Infinity);
  if (mode === "raw") lo = Math.min(lo, 0);
  if (hi === lo) hi = lo + 1;
  const step = n > 1 ? 100 / (n - 1) : 100;
  const x = (i: number) => (n > 1 ? (100 * i) / (n - 1) : 50);
  const y = (v: number) => PAD + ((hi - v) / (hi - lo)) * (H - 2 * PAD);
  const fmt = (v: number) => (mode === "raw" ? hours(v) : signed(v));
  const bandRuns = runs(bandPoints, (b) => b.p25 != null && b.p75 != null);
  const marks = placeAnnotations(annotations, bandPoints.map((b) => b.date));
  const hasCi = panels.some((p) => p.ci?.some((c) => c.lo != null && c.hi != null));
  const first = bandPoints[0]?.date;
  const last = bandPoints.at(-1)?.date;

  // Below 768px the first PHONE_PANELS panels show and the rest are one tap away (review N12): 9 stacked panels were 2,530px.
  // Fold only when it saves at least two panels; the selected hospitals' order is kept, so the urgent care centre stays last.
  const folded = panels.length >= PHONE_PANELS + 2;
  return (
    <div className="phone-fold">
      <ul className="grid gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3" data-testid="small-multiples">
        {panels.map(({ hospital, series, missingUsual, ci }, index) => {
          const code = hospital.hospital_code;
          const annotated = finding?.entity === code;
          const lineRuns = runs(series, (d) => d.value != null);
          const gaps = series.filter((d) => d.value == null).length;
          const gapRuns = runs(series, (d) => d.value == null);
          const ciRuns = runs(ci ?? [], (c) => c.lo != null && c.hi != null);
          const lastValue = [...series].reverse().find((d) => d.value != null);
          const note = pinnedCaveat(hospital);
          return (
            <li key={code} data-testid="multiple" data-hospital={code} data-annotated={annotated ? "" : undefined}
                className={`rounded-md border p-2 ${annotated ? "border-accent" : "border-line"} ${folded && index >= PHONE_PANELS ? "phone-fold-hide" : ""}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-small">
                <span className="font-semibold text-ink"><HospitalName hospital={hospital} /></span>
                {lastValue?.value != null ? (
                  <span className="text-meta tabular-nums text-muted">
                    {shortDay(lastValue.date)}: {fmt(lastValue.value)} {mode === "raw" ? "hours" : "hours vs usual"}
                  </span>
                ) : null}
              </div>
              {mode === "raw" && note ? (
                <div className="mt-1" data-testid="pinned-caveat"><CaveatChip><Glossed text={note} /></CaveatChip></div>
              ) : null}
              {annotated && finding?.chart ? (
                <p className="mt-1 text-meta font-semibold text-ink" data-testid="chart-callout">
                  <span aria-hidden="true">↘ </span>{finding.chart.callout}
                </p>
              ) : null}
              {missingUsual ? (
                <p className="mt-2 flex h-28 items-center justify-center rounded bg-page px-2 text-center text-meta text-muted">{missingUsual}</p>
              ) : (
                <div className="relative mt-1">
                  <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" width="100%" height={H} aria-hidden="true" className="block">
                    <defs>{HATCH(`hatch-${code}`)}</defs>
                    {gapRuns.map((r) => (
                      <rect key={`g${r.start}`} x={Math.max(x(r.start) - step / 2, 0)} width={Math.min(step * r.items.length, 100)} y={0} height={H} fill={`url(#hatch-${code})`} data-testid="gap" />
                    ))}
                    {ciRuns.map((r) => (
                      <polygon key={`c${r.start}`} fill={colors.sunken} fillOpacity={0.6} data-testid="ci"
                               points={[...r.items.map((c, k) => `${x(r.start + k)},${y(c.hi as number)}`),
                                        ...[...r.items].reverse().map((c, k) => `${x(r.start + r.items.length - 1 - k)},${y(c.lo as number)}`)].join(" ")} />
                    ))}
                    {marks.map((m) => (
                      <line key={m.n} x1={x(m.index)} x2={x(m.index)} y1={0} y2={H} stroke={colors.control} strokeWidth={1} vectorEffect="non-scaling-stroke" data-testid="annotation-rule" />
                    ))}
                    {bandRuns.map((r) => (
                      <polygon key={`b${r.start}`} fill={colors.sunken} stroke={colors.line} strokeWidth={1} vectorEffect="non-scaling-stroke" data-testid="band"
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
                      <polyline key={`l${r.start}`} fill="none" stroke={colors.ink} strokeWidth={2} vectorEffect="non-scaling-stroke"
                                data-testid="series" points={r.items.map((d, k) => `${x(r.start + k)},${y(d.value as number)}`).join(" ")} />
                    ))}
                  </svg>
                  <span className="absolute left-0 top-0 text-meta tabular-nums text-tertiary">{fmt(hi)}</span>
                  <span className="absolute bottom-0 left-0 text-meta tabular-nums text-tertiary">{fmt(lo)}</span>
                  {mode === "usual" ? (
                    <span className="absolute right-0 text-meta text-ink" style={{ top: Math.max(y(0) - 12, 0) }}>usual</span>
                  ) : null}
                </div>
              )}
              <p className="sr-only">
                {hospital.hospital_name}: {lastValue?.value != null ? `latest ${fmt(lastValue.value)} hours${mode === "usual" ? " vs its usual level" : ""}` : "no figures"}
                {gaps ? `, ${gaps} days missing` : ""}.
              </p>
              <p className="mt-1 flex justify-between text-meta text-muted" aria-hidden="true">
                <span>{first ? shortDay(first) : ""}</span>
                <span data-testid="panel-n">n = {series.length - gaps} {series.length - gaps === 1 ? "day" : "days"}{gaps ? <span data-testid="gap-count">, {gaps} missing</span> : null}</span>
                <span>{last ? shortDay(last) : ""}</span>
              </p>
            </li>
          );
        })}
      </ul>
      {folded ? (
        <details className="phone-fold-toggle mt-3" data-testid="more-panels">
          <summary className="min-h-11 cursor-pointer select-none py-3 text-small font-semibold text-accent">
            <span className="when-closed">Show all {panels.length} hospitals</span><span className="when-open">Show the first {PHONE_PANELS} only</span>
          </summary>
        </details>
      ) : null}
      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-muted" data-testid="band-legend">
        <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="inline-block h-0.5 w-5 bg-ink" />This hospital</span>
        <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="inline-block h-3 w-5 border border-line bg-sunken" />
          Middle half of the full emergency departments each day, with their median (dashed)</span>
        {mode === "usual" ? <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="inline-block h-px w-5 bg-ink" />Usual level (0)</span> : null}
        {hasCi ? <span className="inline-flex items-center gap-2" data-testid="ci-legend"><span aria-hidden="true" className="inline-block h-3 w-5 bg-sunken opacity-60" />95% interval</span> : null}
        <span className="inline-flex items-center gap-2" data-testid="nodata-legend">
          <svg aria-hidden="true" width="20" height="12" className="block"><defs>{HATCH("hatch-key")}</defs><rect width="20" height="12" fill="url(#hatch-key)" stroke={colors.line} /></svg>No data</span>
      </p>
      {marks.length ? (
        <>
        {annotationSource ? <p className="mt-2 text-meta text-muted" data-testid="annotation-source">Marked days: {annotationSource}.</p> : null}
        <ol className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-meta text-muted" data-testid="annotation-key" aria-label="Marked days">
          {marks.map((m) => (
            <li key={m.n} className="inline-flex items-center gap-2"><span aria-hidden="true" className="inline-block h-3 w-px bg-control" />{shortDay(m.date)}: {m.label}</li>
          ))}
        </ol>
        </>
      ) : null}
    </div>
  );
}
