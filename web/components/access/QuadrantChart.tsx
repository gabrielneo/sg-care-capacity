import type { Meta } from "@/lib/api/types";
import type { QuadrantPoint } from "@/lib/accessCharts";
import { colors } from "@/lib/palette";

import { ChartCard } from "../ChartCard";
import { Glossed } from "../terms/Glossed";

/**
 * Seniors against CDMP clinics per 1,000 seniors, one dot per ranked area, split at the median of
 * each. The "many seniors, few clinics" corner is the one the 3D map's tall, dark areas sit in.
 * Server-rendered SVG: x in percent, y in pixels, so text keeps its size at any width.
 */
const H = 300;
const TOP = 18;
const BOTTOM = 40;
const X0 = 10;   // % of width
const X1 = 96;

export function QuadrantChart({ points, medianSeniors, medianRate, meta, callout }: {
  points: QuadrantPoint[]; medianSeniors: number; medianRate: number; meta: Meta;
  /** The top finding's annotation, e.g. "Hougang: About 13 clinics short of the national rate". */
  callout: { name: string; text: string } | null;
}) {
  const maxX = Math.max(...points.map((p) => p.seniors)) * 1.08;
  // A few small areas have very high ratios; showing them in full would squash the rest. The axis
  // stops at 3 times the median and those areas sit on the top edge, marked and counted.
  const maxY = Math.min(Math.max(...points.map((p) => p.rate)), medianRate * 3) * 1.08;
  const off = points.filter((p) => p.rate > maxY);
  const top5 = points.filter((p) => p.rank != null && p.rank <= 5).sort((a, b) => (a.rank as number) - (b.rank as number));
  const x = (v: number) => X0 + ((X1 - X0) * v) / maxX;
  const y = (v: number) => TOP + (H - TOP - BOTTOM) * (1 - Math.min(v, maxY) / maxY);
  const pct = (v: number) => `${v.toFixed(2)}%`;
  const target = callout ? points.find((p) => p.name === callout.name) : undefined;
  const ordered = [...points].sort((a, b) => (b.rank ?? 99) - (a.rank ?? 99));   // priority dots drawn last, on top
  const summary = `${points.length} areas. ${points.filter((p) => p.rank).sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
    .map((p) => `${p.rank}. ${p.name}: ${p.seniors.toLocaleString("en-SG")} aged 65+, ${p.rate.toFixed(2)} per 1,000`).join("; ")}.`;

  return (
    <ChartCard title="Many seniors, few clinics" slug="quadrant" meta={meta} headingLevel={3}
               description={<Glossed text="Each dot is an area with at least 1,000 residents aged 65+. Across: residents aged 65+. Up: CDMP GP clinics per 1,000 of them. The lines mark the middle value of each." />}>
      {callout ? <p className="mb-1 text-sm font-medium text-ink" data-testid="chart-callout">{callout.name}: {callout.text}</p> : null}
      <svg width="100%" height={H} role="img" aria-label={summary} className="block overflow-visible" data-testid="quadrant-chart">
        {/* the corner that needs attention first: many seniors (right), few clinics (bottom) */}
        <rect x={pct(x(medianSeniors))} width={pct(X1 - x(medianSeniors))} y={y(medianRate)} height={H - BOTTOM - y(medianRate)}
              fill={colors["warn-soft"]} />
        <text x={pct(X1)} y={H - BOTTOM - 6} textAnchor="end" fontSize="11" fill={colors.warn} fontWeight={600}>Many seniors, few clinics</text>
        <line x1={pct(x(medianSeniors))} x2={pct(x(medianSeniors))} y1={TOP} y2={H - BOTTOM} stroke={colors.muted} strokeDasharray="4 4" />
        <line x1={pct(X0)} x2={pct(X1)} y1={y(medianRate)} y2={y(medianRate)} stroke={colors.muted} strokeDasharray="4 4" />
        <line x1={pct(X0)} x2={pct(X1)} y1={H - BOTTOM} y2={H - BOTTOM} stroke={colors.line} />
        <line x1={pct(X0)} x2={pct(X0)} y1={TOP} y2={H - BOTTOM} stroke={colors.line} />
        {ordered.map((p) => (
          <g key={p.name}>
            {p.rate > maxY ? (
              <text x={pct(x(p.seniors))} y={TOP + 4} textAnchor="middle" fontSize="10" fill={colors.muted} data-testid="quadrant-off-scale">
                ▲<title>{`${p.name}: ${p.rate.toFixed(2)} per 1,000, above the axis`}</title>
              </text>
            ) : (
              <circle cx={pct(x(p.seniors))} cy={y(p.rate)} r={p.rank ? 5 : 3.5}
                      fill={p.rank ? colors.accent : colors.muted} fillOpacity={p.rank ? 1 : 0.45}
                      stroke={colors.surface} strokeWidth={1} data-testid="quadrant-dot" data-rank={p.rank ?? undefined}>
                <title>{`${p.name}: ${p.seniors.toLocaleString("en-SG")} residents aged 65+, ${p.rate.toFixed(2)} per 1,000`}</title>
              </circle>
            )}
          </g>
        ))}
        {/* numbers, not names, beside the top 5 (names would collide): the key is under the chart */}
        {top5.map((p) => (
          <text key={`n-${p.name}`} x={pct(x(p.seniors))} y={y(p.rate) + ((p.rank as number) % 2 ? -8 : 15)} fontSize="10"
                fontWeight={700} textAnchor="middle" fill={colors.ink} stroke={colors.surface} strokeWidth={3} paintOrder="stroke">
            {p.rank}
          </text>
        ))}
        {target ? (
          <line x1={pct(x(target.seniors))} x2={pct(x(target.seniors))} y1={2} y2={y(target.rate) - 8} stroke={colors.ink}
                strokeWidth={1.25} data-testid="chart-callout-arrow" data-target={target.name} />
        ) : null}
        <text x={pct((X0 + X1) / 2)} y={H - 6} textAnchor="middle" fontSize="11" fill={colors.muted}>Residents aged 65+</text>
        <text x={pct(X0)} y={H - BOTTOM + 14} fontSize="10" fill={colors.muted}>0</text>
        <text x={pct(X1)} y={H - BOTTOM + 14} textAnchor="end" fontSize="10" fill={colors.muted}>
          {Math.round(maxX / 1000) * 1000 >= 1000 ? `${Math.round(maxX / 1000).toLocaleString("en-SG")},000` : ""}
        </text>
        <text x={pct(X0 - 1)} y={TOP + 4} textAnchor="end" fontSize="10" fill={colors.muted}>{maxY.toFixed(1)}</text>
        <text x={pct(X0 - 1)} y={y(medianRate) + 3} textAnchor="end" fontSize="10" fill={colors.muted}>{medianRate.toFixed(1)}</text>
        <text x={pct(X0 - 1)} y={H - BOTTOM} textAnchor="end" fontSize="10" fill={colors.muted}>0</text>
      </svg>
      <p className="mt-2 text-xs text-ink" data-testid="quadrant-key">
        {top5.map((p, i) => <span key={p.name}>{i ? " · " : ""}<strong>{p.rank}</strong> {p.name}</span>)}
      </p>
      {off.length ? (
        <p className="mt-1 text-xs text-muted">
          {off.length} {off.length === 1 ? "area" : "areas"} above {maxY.toFixed(1)} per 1,000 {off.length === 1 ? "sits" : "sit"} on the top
          edge (▲): {off.map((p) => `${p.name} ${p.rate.toFixed(2)}`).join(", ")}.
        </p>
      ) : null}
    </ChartCard>
  );
}
