import { HospitalName } from "@/components/HospitalName";
import type { Hospital } from "@/lib/api/types";
import { niceAxis, tickText } from "@/lib/axis";
import { formatAsOf } from "@/lib/dates";
import { splitByCare } from "@/lib/hospitals";
import { type Spread, skewSentence } from "@/lib/spread";

import { hours } from "./format";

const GRID = "grid gap-x-4 sm:grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[15rem_minmax(0,1fr)_14rem]";

/**
 * One row per hospital: its days as a box plot on one hours scale. The box is the middle half of days, the line runs from the 10th to
 * the 90th percentile, the bar in the box is the middle day, the diamond the average (what the weekly figures use) and the dot the
 * longest day. HTML rows, as the dumbbell, so it reflows at any width.
 */
export function SpreadChart({ rows, hospitals }: { rows: Spread[]; hospitals: Hospital[] }) {
  if (!rows.length) return null;
  const byCode = new Map(hospitals.map((h) => [h.hospital_code, h]));
  const axis = niceAxis(Math.max(...rows.map((r) => r.max)), 6);
  const pos = (v: number) => (100 * v) / axis.max;
  const sorted = [...rows].sort((a, b) => b.median - a.median || a.code.localeCompare(b.code));
  const { rankable, urgentCare } = splitByCare(sorted, (r) => r.code, hospitals);
  const row = (r: Spread) => {
    const h = byCode.get(r.code);
    return (
      <li key={r.code} className={`${GRID} items-center gap-y-1 rounded-md px-2 py-2 hover:bg-sunken`} data-testid="spread-row" data-hospital={r.code}>
        <span className="min-w-0 text-small font-semibold text-ink">{h ? <HospitalName hospital={h} /> : r.code}</span>
        <span className="relative block h-7 sm:col-span-2 sm:row-start-2 lg:col-span-1 lg:col-start-2 lg:row-start-1" aria-hidden="true">
          {axis.ticks.map((t) => <span key={t} className="absolute inset-y-0 w-px bg-line" style={{ left: `${pos(t)}%` }} />)}
          <span className="absolute top-1/2 h-0.5 -translate-y-1/2 bg-muted" style={{ left: `${pos(r.p10)}%`, width: `${pos(r.p90) - pos(r.p10)}%` }} />
          <span className="absolute top-1/2 h-4 -translate-y-1/2 rounded-sm border border-data-mark bg-accent-soft"
                style={{ left: `${pos(r.p25)}%`, width: `${Math.max(0.5, pos(r.p75) - pos(r.p25))}%` }} />
          <span className="absolute top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-data-mark" style={{ left: `${pos(r.median)}%` }} />
          <span className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-surface bg-ink" style={{ left: `${pos(r.mean)}%` }} />
          <span className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted" style={{ left: `${pos(r.max)}%` }} />
        </span>
        <span className="text-meta text-muted sm:col-start-2 sm:row-start-1 sm:text-right lg:col-start-3 lg:text-left">
          <span className="tabular-nums text-ink">{hours(r.median)} h</span> middle day · longest {hours(r.max)} h
        </span>
      </li>
    );
  };
  return (
    <div>
      <p className="max-w-prose text-small font-semibold text-ink" data-testid="spread-sentence">{skewSentence(rankable)}</p>
      <ul className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-muted" data-testid="spread-legend">
        <li className="flex items-center gap-2"><span aria-hidden="true" className="h-3 w-5 rounded-sm border border-data-mark bg-accent-soft" />Middle half of days</li>
        <li className="flex items-center gap-2"><span aria-hidden="true" className="h-3 w-0.5 bg-data-mark" />Middle day</li>
        <li className="flex items-center gap-2"><span aria-hidden="true" className="h-2.5 w-2.5 rotate-45 bg-ink" />Average (as in the weekly figures)</li>
        <li className="flex items-center gap-2"><span aria-hidden="true" className="h-0.5 w-5 bg-muted" />10th to 90th percentile</li>
        <li className="flex items-center gap-2"><span aria-hidden="true" className="h-2 w-2 rounded-full bg-muted" />Longest day</li>
      </ul>
      <div className={`${GRID} mt-3 px-2`} aria-hidden="true">
        <span className="text-meta text-muted sm:col-span-2 lg:col-span-1">Hours</span>
        <span className="relative block h-5 text-meta tabular-nums text-muted sm:col-span-2 lg:col-span-1">
          {axis.ticks.map((t, i) => (
            <span key={t} className={`absolute top-0 whitespace-nowrap ${i === 0 ? "" : i === axis.ticks.length - 1 ? "-translate-x-full" : "-translate-x-1/2"}`}
                  style={{ left: `${pos(t)}%` }}>{tickText(t, axis.step)}</span>
          ))}
        </span>
      </div>
      <ul>{rankable.map(row)}</ul>
      {urgentCare.length ? (
        <>
          <p className="mt-3 px-2 text-meta font-semibold text-muted">Urgent care centre: compared only with itself</p>
          <ul>{urgentCare.map(row)}</ul>
        </>
      ) : null}
    </div>
  );
}

/** The same figures as a table: the chart's text alternative. */
export function SpreadTable({ rows, hospitals }: { rows: Spread[]; hospitals: Hospital[] }) {
  const byCode = new Map(hospitals.map((h) => [h.hospital_code, h]));
  return (
    <table className="w-full text-left text-small tabular-nums">
      <thead>
        <tr><th scope="col">Hospital</th><th scope="col">Days</th><th scope="col">10th percentile</th><th scope="col">25th</th>
          <th scope="col">Middle day</th><th scope="col">75th</th><th scope="col">90th</th><th scope="col">Average</th><th scope="col">Longest day</th></tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const h = byCode.get(r.code);
          return (
            <tr key={r.code}>
              <td>{h ? <HospitalName hospital={h} /> : r.code}</td><td>{r.n}</td><td>{hours(r.p10)}</td><td>{hours(r.p25)}</td>
              <td>{hours(r.median)}</td><td>{hours(r.p75)}</td><td>{hours(r.p90)}</td><td>{hours(r.mean)}</td>
              <td>{hours(r.max)} ({formatAsOf(r.maxDate)})</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
