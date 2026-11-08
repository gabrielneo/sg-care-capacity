import type { Insight } from "@/lib/api/types";
import type { SlopePair } from "@/lib/edCompare";
import { formatAsOf } from "@/lib/dates";
import { colors } from "@/lib/palette";

import { Glossed } from "../terms/Glossed";
import { hours, shortDay } from "./format";

const H = 220;
const TOP = 16;
const BOTTOM = 16;
const XL = 24;  // % of width
const XR = 76;
const GAP = 13;  // px between labels on the same side

/** Label positions: each at its point, nudged apart where two would overlap (the points stay put). */
export function spread(ys: number[], gap = GAP): number[] {
  const order = ys.map((y, i) => [y, i] as const).sort((a, b) => a[0] - b[0]);
  const out = [...ys];
  let prev = -Infinity;
  for (const [y, i] of order) {
    out[i] = Math.max(y, prev + gap);
    prev = out[i] as number;
  }
  return out;
}

/**
 * NUHS's latest bed-wait estimate beside MOH's latest daily figure, for each NUHS site. Labelled as
 * what it is: different days and different measures (a moment's estimate against a day's median for
 * admitted patients). There are no same-day pairs to compare yet.
 */
export function SlopeChart({ pairs, finding }: { pairs: SlopePair[]; finding: Insight | null }) {
  const both = pairs.filter((p) => p.moh && p.nuhs) as (SlopePair & { moh: NonNullable<SlopePair["moh"]>; nuhs: NonNullable<SlopePair["nuhs"]> })[];
  if (!both.length) return <p className="text-sm text-muted"><Glossed text="No NUHS site has both an estimate and an MOH figure in this data release." /></p>;
  const top = Math.max(...both.flatMap((p) => [p.moh.value, p.nuhs.value])) * 1.1;
  const y = (v: number) => TOP + (1 - v / top) * (H - TOP - BOTTOM);
  const pct = (v: number) => `${v}%`;
  const mohDays = [...new Set(both.map((p) => shortDay(p.moh.date)))].join(", ");
  const nuhsAt = [...new Set(both.map((p) => formatAsOf(p.nuhs.at, { withTime: true })))].join(", ");
  const left = spread(both.map((p) => y(p.moh.value)));
  const right = spread(both.map((p) => y(p.nuhs.value)));
  const summary = both.map((p) => `${p.code}: MOH ${hours(p.moh.value)} hours, NUHS ${hours(p.nuhs.value)} hours`).join("; ");

  return (
    <div>
      {finding?.chart ? <p className="mb-2 text-sm font-medium text-ink" data-testid="chart-callout">{finding.chart.callout}</p> : null}
      <div className="grid grid-cols-2 text-xs font-medium text-ink">
        <p className="text-center"><Glossed text={`MOH figure: daily median, ${mohDays}`} /></p>
        <p className="text-center"><Glossed text={`NUHS estimate: ${nuhsAt}`} /></p>
      </div>
      <svg width="100%" height={H} role="img" aria-label={`${summary}. Different days and different measures.`} data-testid="slope-chart">
        <line x1={pct(XL)} x2={pct(XL)} y1={TOP} y2={H - BOTTOM} stroke={colors.line} />
        <line x1={pct(XR)} x2={pct(XR)} y1={TOP} y2={H - BOTTOM} stroke={colors.line} />
        {both.map((p, i) => (
          <g key={p.code} data-testid="slope" data-hospital={p.code}>
            <line x1={pct(XL)} x2={pct(XR)} y1={y(p.moh.value)} y2={y(p.nuhs.value)} stroke={colors.accent} strokeWidth={2} />
            <circle cx={pct(XL)} cy={y(p.moh.value)} r={4} fill={colors.accent} />
            <circle cx={pct(XR)} cy={y(p.nuhs.value)} r={4} fill={colors.accent} />
            <text x={pct(XL)} dx={-8} y={(left[i] as number) + 4} textAnchor="end" fontSize="11" fill={colors.ink}>{p.code} {hours(p.moh.value)} h</text>
            <text x={pct(XR)} dx={8} y={(right[i] as number) + 4} fontSize="11" fill={colors.ink}>{hours(p.nuhs.value)} h {p.code}</text>
          </g>
        ))}
      </svg>
      <p className="mt-1 text-xs text-muted" data-testid="slope-caveat">
        <Glossed text="Different days and different measures: NUHS estimates the wait at one moment; MOH reports the day's median for admitted patients, a few days later." />
      </p>
    </div>
  );
}
