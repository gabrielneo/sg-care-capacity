import { cssColors as colors } from "@/lib/palette";

import { niceScale } from "./LineChart";

const H = 200;
const TOP = 12;
const BOTTOM = 30;
const XL = 9;
const XR = 98;

/**
 * Percentage changes as bars up and down from 0, one per month, drawn on the server. A month with no figure (partial, or nothing a
 * year before) is no bar. `tone` "wait": above 0 is a longer wait, in the status colours (amber up, teal down); "visits": one
 * neutral colour, since more visits is not better or worse by itself. A value is never drawn as 0 when it is missing.
 */
export function ChangeBars({ labels, values, unit, summary, tone, every = 1, testId = "change-bars" }: {
  labels: string[]; values: (number | null)[]; unit: string; summary: string; tone: "wait" | "visits"; every?: number; testId?: string;
}) {
  const known = values.filter((v): v is number => v != null);
  if (!known.length) return <p className="text-small text-muted" data-testid={`${testId}-empty`}>No month has a complete month a year before it to compare with.</p>;
  const hi = Math.max(0, ...known);
  const lo = Math.min(0, ...known);
  const { step } = niceScale(Math.max(hi, -lo, 1), 2);
  const upTop = Math.ceil(hi / step) * step;
  const downTop = Math.ceil(-lo / step) * step;
  const span = upTop + downTop || step;
  const y = (v: number) => TOP + ((upTop - v) / span) * (H - TOP - BOTTOM);
  const n = labels.length;
  const slot = (XR - XL) / n;
  const x = (i: number) => XL + i * slot;
  const ticks: number[] = [];
  for (let t = -downTop; t <= upTop + 1e-9; t += step) ticks.push(Math.round(t * 100) / 100);
  const fill = (v: number) => (tone === "visits" ? colors["data-mark"] : v > 0 ? colors["status-higher"] : colors["status-lower"]);
  return (
    <div>
      <p className="text-meta text-muted">{unit}</p>
      <svg width="100%" height={H} role="img" aria-label={summary} data-testid={testId}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={`${XL}%`} x2={`${XR}%`} y1={y(t)} y2={y(t)} stroke={colors.line} strokeWidth={t === 0 ? 1.5 : 1} />
            <text x={`${XL}%`} dx={-6} y={y(t) + 4} textAnchor="end" fontSize="13" fill={colors.muted}>{t > 0 ? `+${t}` : t < 0 ? `−${-t}` : "0"}</text>
          </g>
        ))}
        {values.map((v, i) => (v == null ? null : (
          <rect key={labels[i]! + i} data-testid="change-bar" data-value={v} x={`${x(i) + slot * 0.15}%`} width={`${slot * 0.7}%`}
                y={Math.min(y(v), y(0))} height={Math.max(Math.abs(y(v) - y(0)), 1)} fill={fill(v)} />
        )))}
        {labels.map((l, i) => (i % every === 0 ? (
          <text key={l + i} x={`${x(i) + slot / 2}%`} y={H - 8} textAnchor="middle" fontSize="13" fill={colors.muted}>{l}</text>
        ) : null))}
      </svg>
    </div>
  );
}
