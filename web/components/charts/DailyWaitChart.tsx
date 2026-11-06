"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatDay, type WideRow } from "@/lib/series";

import { AXIS, CHART_HEIGHT, GRID, hours, type SeriesInfo, SeriesLegend, TooltipBox } from "./common";

const tick = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${Number(d)} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m) - 1]}`;
};

interface TipProps {
  active?: boolean;
  label?: string | number;
  data: WideRow[];
  series: SeriesInfo[];
}

/** Recharts injects active/label; every hospital is listed, with "no data" for a gap. */
function DailyTip({ active, label, data, series }: TipProps) {
  if (!active || label == null) return null;
  const row = data.find((r) => r.date === label);
  return (
    <TooltipBox
      title={formatDay(String(label))}
      rows={series.map((s) => ({ key: s.code, label: `${s.code} median wait`, color: s.style.color,
                                 value: hours((row?.[s.code] as number | null | undefined) ?? null) }))}
    />
  );
}

/** Daily median wait for a ward bed, one line per hospital. A missing day is a gap, never joined. */
export function DailyWaitChart({ data, series, width }: { data: WideRow[]; series: SeriesInfo[]; width?: number }) {
  const chart = (
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 8, left: 0 }} width={width} height={width ? CHART_HEIGHT : undefined}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="date" tickFormatter={tick} minTickGap={24} {...AXIS} />
          <YAxis width={48} {...AXIS} label={{ value: "hours", angle: -90, position: "insideLeft", fill: AXIS.stroke, fontSize: 12 }} />
          <Tooltip content={<DailyTip data={data} series={series} />} />
          {series.map((s) => (
            <Line key={s.code} type="linear" dataKey={s.code} name={s.name} stroke={s.style.color} strokeWidth={2}
                  strokeDasharray={s.style.dash || undefined} dot={false} connectNulls={false} isAnimationActive={false} />
          ))}
        </LineChart>
  );
  return (
    <div data-testid="chart-daily-wait">
      {/* A fixed width skips the resize observer (used by tests); otherwise fill the card. */}
      {width ? chart : <ResponsiveContainer width="100%" height={CHART_HEIGHT}>{chart}</ResponsiveContainer>}
      <SeriesLegend series={series} />
    </div>
  );
}
