import { cssColors as colors } from "@/lib/palette";

import { spread } from "../edcharts/SlopeChart";
import { type HoverBand, HoverBands } from "./HoverBands";

const H = 260;
const TOP = 12;
const BOTTOM = 30;
const XL = 9;      // % of width: the plot's left edge (room for the y labels)
const XR = 88;     // % of width: its right edge (room for the end labels)

export interface LineSeries {
  key: string;
  /** Written at the end of the line. */
  label: string;
  color: keyof typeof colors;
  /** One value per x label; null is a gap in the line (a missing or partial month), never joined. */
  values: (number | null)[];
  /** The newest series is drawn heavier. */
  strong?: boolean;
}

/** A round upper bound for the y axis and the tick step: 1, 2, 2.5 or 5 times a power of ten. */
export function niceScale(max: number, ticks = 4): { top: number; step: number } {
  if (!(max > 0)) return { top: 1, step: 1 / ticks };
  const raw = max / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * mag >= raw) as number) * mag;
  return { top: step * ticks, step };
}

const compact = (v: number) => (Math.abs(v) >= 10_000 ? `${Math.round(v / 1000)}k` : v.toLocaleString("en-SG", { maximumFractionDigits: 1 }));

/**
 * Lines on one axis, drawn on the server. The y axis starts at 0, so a line's height is its value and a fall is not exaggerated.
 * A null value breaks the line; a lone point is a dot. x labels are given in full and thinned to `every`.
 */
export function LineChart({ labels, series, unit, summary, every = 1, testId = "line-chart", titles, format = compact }: {
  labels: string[]; series: LineSeries[]; unit: string; summary: string; every?: number; testId?: string;
  /** Each x label in full, for the hover tooltip ("October 2026"); defaults to the labels. */
  titles?: string[];
  /** A value as the tooltip says it ("2.9 hours"). */
  format?: (v: number) => string;
}) {
  const known = series.flatMap((s) => s.values).filter((v): v is number => v != null);
  if (!known.length) return <p className="text-small text-muted" data-testid={`${testId}-empty`}>No complete months to draw.</p>;
  const { top, step } = niceScale(Math.max(...known));
  const n = labels.length;
  const xPct = (i: number) => XL + (n <= 1 ? 0 : (i * (XR - XL)) / (n - 1));
  const y = (v: number) => TOP + (1 - v / top) * (H - TOP - BOTTOM);
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const ends = series.map((s) => {
    const i = s.values.reduce<number>((last, v, k) => (v != null ? k : last), -1);
    return i < 0 ? null : { i, v: s.values[i] as number };
  });
  const labelY = spread(ends.map((e) => (e ? y(e.v) : 0)), 15);
  // One hover column per x label, centred on its point; the first and last stop at the plot's edges.
  const w = n <= 1 ? XR - XL : (XR - XL) / (n - 1);
  const bands: HoverBand[] = labels.map((l, i) => {
    const left = Math.max(XL - w / 2, xPct(i) - w / 2);
    return {
      left, width: Math.min(xPct(i) + w / 2, XR + w / 2) - left, title: titles?.[i] ?? l,
      rows: series.map((s) => ({ label: series.length > 1 ? s.label : undefined, color: colors[s.color],
                                 value: s.values[i] == null ? "no complete month" : format(s.values[i] as number) })),
      marks: series.flatMap((s) => (s.values[i] == null ? [] : [{ y: y(s.values[i] as number), color: colors[s.color] }])),
    };
  });
  return (
    <div>
      <p className="text-meta text-muted">{unit}</p>
      <div className="relative">
      <HoverBands bands={bands} plotTop={TOP} plotBottom={H - BOTTOM} testId={`${testId}-hover`} />
      <svg width="100%" height={H} role="img" aria-label={summary} data-testid={testId}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={`${XL}%`} x2={`${XR}%`} y1={y(t)} y2={y(t)} stroke={colors.line} strokeWidth={t === 0 ? 1.5 : 1} />
            <text x={`${XL}%`} dx={-6} y={y(t) + 4} textAnchor="end" fontSize="13" fill={colors.muted}>{compact(t)}</text>
          </g>
        ))}
        {labels.map((l, i) => (i % every === 0 ? (
          <text key={l + i} x={`${xPct(i)}%`} y={H - 8} textAnchor="middle" fontSize="13" fill={colors.muted}>{l}</text>
        ) : null))}
        {series.map((s, k) => (
          <g key={s.key} data-testid="line-series" data-series={s.key}>
            {s.values.map((v, i) => {
              const next = s.values[i + 1];
              const prev = s.values[i - 1];
              if (v == null) return null;
              return (
                <g key={i}>
                  {next != null ? <line x1={`${xPct(i)}%`} x2={`${xPct(i + 1)}%`} y1={y(v)} y2={y(next)} stroke={colors[s.color]}
                                         strokeWidth={s.strong ? 2.5 : 1.5} strokeLinecap="round" /> : null}
                  {next == null && prev == null ? <circle cx={`${xPct(i)}%`} cy={y(v)} r={3} fill={colors[s.color]} /> : null}
                </g>
              );
            })}
            {ends[k] ? (
              <>
                <circle cx={`${xPct((ends[k] as { i: number }).i)}%`} cy={y((ends[k] as { v: number }).v)} r={s.strong ? 4 : 3} fill={colors[s.color]} />
                <text x={`${xPct((ends[k] as { i: number }).i)}%`} dx={8} y={(labelY[k] as number) + 4} fontSize="13" fontWeight={s.strong ? 600 : 400}
                      fill={colors.ink}>{s.label}</text>
              </>
            ) : null}
          </g>
        ))}
      </svg>
      </div>
    </div>
  );
}
