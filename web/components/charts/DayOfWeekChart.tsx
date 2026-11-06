"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { WeekdayRow } from "@/lib/series";

import { AXIS, CHART_HEIGHT, GRID, hours, type SeriesInfo, SeriesLegend, TooltipBox } from "./common";

const FULL = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" } as const;

interface TipProps {
  active?: boolean;
  label?: string | number;
  data: WeekdayRow[];
  series: SeriesInfo[];
}

function WeekdayTip({ active, label, data, series }: TipProps) {
  if (!active || label == null) return null;
  const row = data.find((r) => r.day === label);
  return (
    <TooltipBox
      title={`${FULL[label as keyof typeof FULL] ?? label}s in the range`}
      rows={series.map((s) => ({ key: s.code, color: s.style.color, label: s.name,
                                 value: `${hours((row?.[s.code] as number | null) ?? null)} (${row?.[`${s.code}_n`] ?? 0} days)` }))}
    />
  );
}

/** Mean of the daily median waits for each weekday, per hospital; the tooltip gives the day count. */
export function DayOfWeekChart({ data, series }: { data: WeekdayRow[]; series: SeriesInfo[] }) {
  return (
    <div data-testid="chart-day-of-week">
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="day" {...AXIS} />
          <YAxis width={48} {...AXIS} label={{ value: "hours (average of each day's median)", angle: -90, position: "insideLeft", fill: AXIS.stroke, fontSize: 12, dy: 100 }} />
          <Tooltip content={<WeekdayTip data={data} series={series} />} />
          {series.map((s) => (
            <Line key={s.code} type="linear" dataKey={s.code} name={s.name} stroke={s.style.color} strokeWidth={2}
                  strokeDasharray={s.style.dash || undefined} dot={{ r: 3 }} connectNulls={false} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <SeriesLegend series={series} />
    </div>
  );
}
