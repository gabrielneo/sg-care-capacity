"use client";

import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";

import { formatDay, type ScatterPoint } from "@/lib/series";

import { AXIS, CHART_HEIGHT, GRID, hours, patients, type SeriesInfo, SeriesLegend, SHAPES, TooltipBox } from "./common";

interface TipProps {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: ScatterPoint & { code?: string; name?: string } }>;
}

function PointTip({ active, payload }: TipProps) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  return (
    <TooltipBox
      title={`${p.code ? `${p.code} ${p.name ?? ""} · ` : ""}${formatDay(p.date)}`}
      rows={[{ key: "w", label: "Median wait", value: hours(p.wait) }, { key: "a", label: "Attendances", value: patients(p.attendances) }]}
    />
  );
}

/** One point per hospital per day with both values: attendances (x) against median wait (y). */
export function WaitAttendanceScatter({ points, series }: { points: Record<string, ScatterPoint[]>; series: SeriesInfo[] }) {
  return (
    <div data-testid="chart-scatter">
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <ScatterChart margin={{ top: 8, right: 12, bottom: 24, left: 0 }}>
          <CartesianGrid stroke={GRID} />
          <XAxis type="number" dataKey="attendances" name="Attendances" {...AXIS}
                 label={{ value: "attendances (patients per day)", position: "insideBottom", offset: -12, fill: AXIS.stroke, fontSize: 12 }} />
          <YAxis type="number" dataKey="wait" name="Median wait" width={48} {...AXIS}
                 label={{ value: "hours", angle: -90, position: "insideLeft", fill: AXIS.stroke, fontSize: 12 }} />
          <ZAxis range={[28, 28]} />
          <Tooltip content={<PointTip />} />
          {series.map((s, i) => (
            <Scatter key={s.code} name={s.name} data={(points[s.code] ?? []).map((p) => ({ ...p, code: s.code, name: s.name }))}
                     fill={s.style.color} fillOpacity={0.7} shape={SHAPES[i % SHAPES.length]} isAnimationActive={false} />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
      <SeriesLegend series={series} shapes />
    </div>
  );
}
