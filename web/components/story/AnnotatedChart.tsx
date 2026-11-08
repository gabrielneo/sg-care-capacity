import type { ReactNode } from "react";

import type { InsightChart, Meta } from "@/lib/api/types";
import { colors } from "@/lib/palette";

import { ChartCard } from "../ChartCard";

/**
 * A small chart that labels its own marks, plus one callout arrow pointing at the difference the
 * headline describes. Plain SVG, rendered on the server: no chart library and no JavaScript, so it
 * is correct before (and without) hydration and never shifts the layout.
 *
 * - x positions are percentages of the width and y positions are pixels, so text keeps its size at
 *   any width (375 px to desktop) instead of scaling with a viewBox.
 * - Direct labels: every bar's value; on a line, the highlighted point and the reference line.
 * - Legend: only when there are more than 3 series (direct labels collide beyond that).
 * - A missing value (null) is a gap: no bar, a break in the line. Never 0.
 * - Wrapped in ChartCard, so "Data as of" and the source are always shown.
 */

export interface ChartSeries {
  key: string;
  label: string;
  values: (number | null)[];
}

export interface AnnotatedChartProps {
  /** Unique on the page: the same chart can render twice (inline on phones, the sticky panel on desktop). */
  id: string;
  title: ReactNode;
  description?: ReactNode;
  meta: Meta;
  kind: "bar" | "line";
  categories: { key: string; label: string }[];
  /** Bars use the first series; lines draw each one. */
  series: ChartSeries[];
  /** Category keys the callout points at; the last one gets the arrow. */
  highlight: string[];
  callout: string;
  reference?: { value: number; label: string } | null;
  trendLine?: { first: number; last: number } | null;
  format: (v: number) => string;
  xLabel?: string | null;
  caveat?: string | null;
  headingLevel?: 2 | 3;
  /** For a finding's chart: each source's own date, and the finding's data window (see Provenance). */
  bySource?: boolean;
  findingTo?: string | null;
  height?: number;
}

export const LEGEND_ABOVE = 3;
const SERIES_COLOURS = [colors.accent, colors["map-4"], colors["map-5"], colors.warn, colors.muted];
const colourAt = (i: number): string => SERIES_COLOURS[i % SERIES_COLOURS.length] ?? colors.ink;
const X0 = 6;            // plot area, % of width
const X1 = 94;
const TOP = 34;          // px: room for the arrow's tail under the callout text
const BOTTOM = 26;       // px: x labels

/** The props for an insight's chart. */
export function fromInsightChart(chart: InsightChart): Pick<AnnotatedChartProps, "kind" | "categories" | "series" | "highlight" |
  "callout" | "reference" | "trendLine" | "xLabel"> {
  return {
    kind: chart.kind,
    categories: chart.points.map((p) => ({ key: p.key, label: p.label })),
    series: [{ key: "values", label: chart.y_label, values: chart.points.map((p) => p.value) }],
    highlight: chart.highlight,
    callout: chart.callout,
    reference: chart.reference,
    trendLine: chart.trend_line,
    xLabel: chart.x_label,
  };
}

/**
 * Which x labels fit. "always": every label up to 7, else the first, last and highlighted ones plus
 * every k-th (about 4 in all). "wide": the extra labels shown from 640 px up (all of them up to 12).
 */
export function visibleLabels(n: number, highlighted: number[]): { always: Set<number>; wide: Set<number> } {
  const every = (k: number) => Array.from({ length: n }, (_, i) => i).filter((i) => i % k === 0);
  if (n <= 7) return { always: new Set(every(1)), wide: new Set() };
  const always = new Set<number>([0, n - 1, ...highlighted, ...every(Math.ceil(n / 4))]);
  const more = n <= 12 ? every(1) : every(Math.ceil(n / 8));
  return { always, wide: new Set(more.filter((i) => !always.has(i))) };
}

/** A white halo behind SVG text, so labels stay legible where they cross a line. */
const HALO = { stroke: colors.surface, strokeWidth: 3, paintOrder: "stroke" as const, strokeLinejoin: "round" as const };

export function AnnotatedChart(props: AnnotatedChartProps) {
  const { id, title, description, meta, caveat, headingLevel = 2, bySource, findingTo } = props;
  return (
    <ChartCard title={title} slug={id} meta={meta} description={description} caveat={caveat} headingLevel={headingLevel}
               bySource={bySource} findingTo={findingTo}>
      <Plot {...props} />
    </ChartCard>
  );
}

function Plot({ id, kind, categories, series, highlight, callout, reference, trendLine, format, xLabel, height = 240 }: AnnotatedChartProps) {
  const n = categories.length;
  const drawn = kind === "bar" ? series.slice(0, 1) : series;
  const values = drawn.flatMap((s) => s.values).filter((v): v is number => v != null);
  const extra = [reference?.value, trendLine?.first, trendLine?.last].filter((v): v is number => v != null);
  let lo = Math.min(...values, ...extra);
  let hi = Math.max(...values, ...extra);
  if (kind === "bar") {
    lo = Math.min(lo, 0);
    hi = Math.max(hi, 0);
  }
  const pad = (hi - lo || Math.abs(hi) || 1) * 0.12;
  if (kind === "line" || lo < 0) lo -= pad;
  hi += pad;
  const plotBottom = height - BOTTOM;
  const y = (v: number) => TOP + ((hi - v) / (hi - lo)) * (plotBottom - TOP);
  const band = (X1 - X0) / n;
  const x = (i: number) => (kind === "bar" ? X0 + band * (i + 0.5) : X0 + ((X1 - X0) * i) / Math.max(n - 1, 1));
  const pct = (v: number) => `${v.toFixed(3)}%`;

  const marked = highlight.map((k) => categories.findIndex((c) => c.key === k)).filter((i) => i >= 0);
  const target = marked.at(-1) ?? n - 1;
  const targetValue = drawn[0]?.values[target] ?? null;
  const zero = y(Math.max(lo, Math.min(hi, 0)));
  const targetTop = targetValue == null ? TOP : kind === "bar" ? Math.min(y(targetValue), zero) : y(targetValue);
  const labels = visibleLabels(n, marked);
  const legend = drawn.length > LEGEND_ABOVE;
  const arrowId = `${id}-arrow`;
  const right = x(target) > 50;
  const summary = `${callout}. ${categories.map((c, i) => `${c.label}: ${fmt(drawn[0]?.values[i] ?? null, format)}`).join("; ")}.`;

  return (
    <figure className="annotated-chart" data-testid="annotated-chart" data-kind={kind}>
      <p className={`mb-1 text-sm font-medium text-ink ${right ? "text-right" : ""}`} data-testid="chart-callout">
        {callout}
      </p>
      <svg width="100%" height={height} role="img" aria-label={summary} className="block overflow-visible">
        <defs>
          <marker id={arrowId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill={colors.ink} />
          </marker>
        </defs>
        {/* baseline and reference line */}
        {kind === "bar" ? <line x1={pct(X0)} x2={pct(X1)} y1={zero} y2={zero} stroke={colors.line} /> : null}
        {reference ? (
          <g data-testid="chart-reference">
            <line x1={pct(X0)} x2={pct(X1)} y1={y(reference.value)} y2={y(reference.value)} stroke={colors.muted}
                  strokeDasharray="4 4" />
            {/* on the side away from the highlighted point, where the marks are less likely to be */}
            <text x={pct(right ? X0 : X1)} y={y(reference.value) - 5} fontSize="11" fill={colors.muted}
                  textAnchor={right ? "start" : "end"} {...HALO}>
              {reference.label}{reference.value !== 0 ? `: ${format(reference.value)}` : ""}
            </text>
          </g>
        ) : null}
        {/* marks */}
        {kind === "bar"
          ? drawn[0]?.values.map((v, i) => {
              if (v == null) {
                return <text key={i} x={pct(x(i))} y={zero - 4} fontSize="10" textAnchor="middle" fill={colors.muted}>No data</text>;
              }
              const top = Math.min(y(v), zero);
              const hot = marked.includes(i);
              return (
                <g key={i} data-testid="chart-bar" data-highlight={hot ? "" : undefined}>
                  <rect x={pct(x(i) - band * 0.34)} width={pct(band * 0.68)} y={top} height={Math.max(Math.abs(y(v) - zero), 1)}
                        rx="2" fill={hot ? colors.accent : colors.line} />
                  <text x={pct(x(i))} y={v >= 0 ? top - 4 : top + Math.abs(y(v) - zero) + 12} fontSize="11" textAnchor="middle"
                        fill={hot ? colors.ink : colors.muted} fontWeight={hot ? 600 : 400} className="tabular-nums" {...HALO}>
                    {format(v)}
                  </text>
                </g>
              );
            })
          : drawn.map((s, si) => (
              <g key={s.key} data-testid="chart-line">
                {s.values.map((v, i) => {
                  const next = s.values[i + 1];
                  return v != null && next != null ? (
                    <line key={i} x1={pct(x(i))} x2={pct(x(i + 1))} y1={y(v)} y2={y(next)}
                          stroke={colourAt(si)} strokeWidth="2" />
                  ) : null;
                })}
                {s.values.map((v, i) =>
                  v == null ? null : (
                    <circle key={`p${i}`} cx={pct(x(i))} cy={y(v)} r={marked.includes(i) && si === 0 ? 5 : 3}
                            fill={marked.includes(i) && si === 0 ? colors.accent : colourAt(si)}
                            data-highlight={marked.includes(i) && si === 0 ? "" : undefined} />
                  ),
                )}
                {drawn.length > 1 && !legend ? <EndLabel series={s} x={x} y={y} pct={pct} colour={colourAt(si)} /> : null}
              </g>
            ))}
        {kind === "line" && marked.length && targetValue != null ? (
          <text x={pct(x(target))} dx={right ? -9 : 9} y={y(targetValue) + 4} fontSize="11" fontWeight={600} fill={colors.ink}
                textAnchor={right ? "end" : "start"} className="tabular-nums" data-testid="chart-point-label" {...HALO}>
            {format(targetValue)}
          </text>
        ) : null}
        {trendLine ? (
          <line x1={pct(x(0))} x2={pct(x(n - 1))} y1={y(trendLine.first)} y2={y(trendLine.last)} stroke={colors.ink}
                strokeWidth="1.5" strokeDasharray="6 3" data-testid="chart-trend-line" />
        ) : null}
        {/* the callout arrow, from under the callout text down to the highlighted mark */}
        <line x1={pct(x(target))} x2={pct(x(target))} y1={2} y2={Math.max(targetTop - (kind === "bar" ? 16 : 8), 10)}
              stroke={colors.ink} strokeWidth="1.25" markerEnd={`url(#${arrowId})`} data-testid="chart-callout-arrow"
              data-target={categories[target]?.key} />
        {/* x labels */}
        {categories.map((c, i) =>
          labels.always.has(i) || labels.wide.has(i) ? (
            <text key={c.key} x={pct(x(i))} y={height - 8} fontSize="11" textAnchor={kind === "line" && i === 0 ? "start" :
                  kind === "line" && i === n - 1 ? "end" : "middle"} fill={marked.includes(i) ? colors.ink : colors.muted}
                  fontWeight={marked.includes(i) ? 600 : 400} className={labels.always.has(i) ? undefined : "max-sm:hidden"}
                  data-testid="chart-x-label">
              {c.label}
            </text>
          ) : null,
        )}
      </svg>
      {xLabel ? <figcaption className="mt-1 text-xs text-muted">{xLabel}</figcaption> : null}
      {legend ? (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" data-testid="chart-legend">
          {drawn.map((s, si) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span aria-hidden="true" className="inline-block h-0.5 w-4" style={{ background: colourAt(si) }} />
              {s.label}
            </li>
          ))}
        </ul>
      ) : null}
    </figure>
  );
}

function fmt(v: number | null, format: (v: number) => string): string {
  return v == null ? "no data" : format(v);
}

function EndLabel({ series, x, y, pct, colour }: { series: ChartSeries; x: (i: number) => number; y: (v: number) => number;
  pct: (v: number) => string; colour: string }) {
  const i = series.values.findLastIndex((v) => v != null);
  if (i < 0) return null;
  return (
    <text x={pct(x(i))} y={y(series.values[i] as number) - 8} fontSize="11" textAnchor="end" fill={colour} fontWeight={600}>
      {series.label}
    </text>
  );
}
