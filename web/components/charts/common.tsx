"use client";

import { Symbols } from "recharts";

import type { SeriesStyle } from "@/lib/hospitalStyle";

export interface SeriesInfo {
  code: string;
  name: string;
  style: SeriesStyle;
}

export const CHART_HEIGHT = 320;
export const AXIS = { stroke: "#475569", fontSize: 12 } as const;
export const GRID = "#E2E8F0";

const fmt1 = (v: number) => v.toLocaleString("en-SG", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
export const hours = (v: number | null | undefined) => (v == null ? "no data" : `${fmt1(v)} hours`);
export const patients = (v: number | null | undefined) => (v == null ? "no data" : `${v.toLocaleString("en-SG")} patients`);

export const SHAPES = ["circle", "square", "triangle", "diamond", "cross", "star", "wye", "circle", "square"] as const;

/**
 * Legend with the line sample (colour and dash) or, for scatters, the point shape, so series are
 * never told apart by colour alone.
 */
export function SeriesLegend({ series, shapes = false }: { series: SeriesInfo[]; shapes?: boolean }) {
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink" aria-label="Legend">
      {series.map((s, i) => (
        <li key={s.code} className="flex items-center gap-1.5">
          {shapes ? (
            <svg width="14" height="14" aria-hidden="true">
              <Symbols cx={7} cy={7} size={48} type={SHAPES[i % SHAPES.length]} fill={s.style.color} />
            </svg>
          ) : (
            <svg width="28" height="8" aria-hidden="true">
              <line x1="0" y1="4" x2="28" y2="4" stroke={s.style.color} strokeWidth="2.5" strokeDasharray={s.style.dash || undefined} />
            </svg>
          )}
          <span>
            <span className="font-medium">{s.code}</span> {s.name}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function TooltipBox({ title, rows }: { title: string; rows: { key: string; label: string; value: string; color?: string }[] }) {
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2 text-xs text-ink shadow-md">
      <p className="mb-1 font-semibold">{title}</p>
      <ul className="space-y-0.5">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center gap-2">
            {r.color ? <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: r.color }} /> : null}
            <span>{r.label}:</span>
            <span className="font-medium tabular-nums">{r.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
