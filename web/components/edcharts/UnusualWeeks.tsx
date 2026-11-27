import type { Hospital } from "@/lib/api/types";
import { formatAsOf } from "@/lib/dates";
import { splitByCare } from "@/lib/hospitals";
import { cssColors as colors } from "@/lib/palette";
import { LEVELS, type Level } from "@/lib/status";
import { type WeekGrid, type WeekRow, tallySentence, weekTally } from "@/lib/unusualWeeks";

import { HospitalName } from "../HospitalName";

/** The badge's colours. "About usual" is the row's quiet background, so the marked weeks stand out; a gap is a week with no comparison. */
const FILL: Partial<Record<Level, string>> = {
  much_higher: colors["status-much"], higher: colors["status-higher"], lower: colors["status-lower"],
};
const KEY: Level[] = ["much_higher", "higher", "lower", "usual", "unknown"];

/** The first week of each year: where the year labels go. */
function yearStarts(weeks: string[]): { i: number; year: string }[] {
  return weeks.flatMap((w, i) => (i === 0 || w.slice(0, 4) !== weeks[i - 1]?.slice(0, 4) ? [{ i, year: w.slice(0, 4) }] : []));
}

/** Neighbouring weeks of one level as one run, so a row of 200 weeks is a few dozen rectangles, not 200. */
export function runs(levels: Level[]): { start: number; length: number; level: Level }[] {
  const out: { start: number; length: number; level: Level }[] = [];
  levels.forEach((level, i) => {
    const last = out.at(-1);
    if (last && last.level === level) last.length += 1;
    else out.push({ start: i, length: 1, level });
  });
  return out;
}

function Track({ row, n }: { row: WeekRow; n: number }) {
  return (
    // viewBox in weeks: one unit a week, stretched to the width. Rectangles only, so the stretch distorts nothing that is read.
    <svg viewBox={`0 0 ${n} 1`} preserveAspectRatio="none" width="100%" height="18" aria-hidden="true" className="block">
      {runs(row.levels).map((r) => (r.level === "unknown" ? null : (
        <rect key={r.start} x={r.start} y={0} width={r.length + 0.02} height={1} fill={FILL[r.level] ?? colors["status-usual-soft"]} data-level={r.level} />
      )))}
    </svg>
  );
}

/**
 * Every complete week of every hospital since the data starts, marked the way the status badge marks the latest one. A row is one
 * hospital; a coloured mark is a week far from that hospital's usual. Rows of HTML (the name) and a stretched SVG (the weeks), so it
 * reflows at any width; on a phone the weeks scroll sideways inside the chart, never the page.
 */
export function UnusualWeeks({ grid, hospitals }: { grid: WeekGrid; hospitals: Hospital[] }) {
  const n = grid.weeks.length;
  if (!n) return null;
  const byCode = new Map(hospitals.map((h) => [h.hospital_code, h]));
  const { rankable, urgentCare } = splitByCare(grid.rows, (r) => r.code, hospitals);
  const sentence = tallySentence(weekTally(rankable));
  const years = yearStarts(grid.weeks);
  const GRID = "grid grid-cols-[4rem_minmax(0,1fr)] items-center gap-x-3 sm:grid-cols-[13rem_minmax(0,1fr)]";
  const row = (r: WeekRow) => {
    const h = byCode.get(r.code);
    return (
      <li key={r.code} className={GRID} data-testid="week-row" data-hospital={r.code}>
        {/* Pinned while the weeks scroll sideways on a phone, where the code stands in for the name (the table has both). */}
        <span className="sticky left-0 z-10 truncate bg-surface text-small text-ink">
          <span className="sm:hidden">{r.code}</span>
          <span className="hidden sm:inline">{h ? <HospitalName hospital={h} /> : r.code}</span>
        </span>
        <Track row={r} n={n} />
      </li>
    );
  };
  return (
    <div>
      {sentence ? <p className="max-w-prose text-small font-semibold text-ink" data-testid="week-tally">{sentence}</p> : null}
      <ul className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-muted" data-testid="week-legend">
        {KEY.map((l) => (
          <li key={l} className="flex items-center gap-2">
            <span aria-hidden="true" className="h-3 w-3 rounded-sm"
                  style={l === "unknown" ? { border: `1px dashed ${colors.muted}` } : { background: FILL[l] ?? colors["status-usual-soft"] }} />
            {l === "unknown" ? "No comparison (no figure, or too few weeks before)" : LEVELS[l].label}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-meta text-muted sm:hidden" data-testid="weeks-scroll-hint">Scroll sideways for every week →</p>
      <div className="mt-1 overflow-x-auto sm:mt-3" tabIndex={0} role="region" aria-label="Unusual weeks by hospital, scrolls sideways"
           data-testid="weeks-scroller">
        <div className="min-w-xl">
          <ul className="space-y-1">{rankable.map(row)}</ul>
          {urgentCare.length ? (
            <>
              <p className="sticky left-0 mt-3 w-fit text-meta font-semibold text-muted">Urgent care centre: compared only with itself</p>
              <ul className="mt-1 space-y-1">{urgentCare.map(row)}</ul>
            </>
          ) : null}
          <div className={`${GRID} mt-1`} aria-hidden="true">
            <span />
            <span className="relative block h-5 text-meta tabular-nums text-muted">
              {years.map(({ i, year }) => (
                <span key={year} className="absolute top-0 whitespace-nowrap border-l border-line pl-1" style={{ left: `${(100 * i) / n}%` }}>{year}</span>
              ))}
            </span>
          </div>
        </div>
      </div>
      <p className="mt-2 text-meta text-muted">
        Weeks starting {formatAsOf(grid.weeks[0] as string)} to {formatAsOf(grid.weeks.at(-1) as string)}, each one judged against the hospital&apos;s
        own weeks before it, as the status badge judges the latest.
      </p>
    </div>
  );
}

/** The marked weeks as a table: the chart's text alternative. */
export function UnusualWeeksTable({ grid, hospitals }: { grid: WeekGrid; hospitals: Hospital[] }) {
  const byCode = new Map(hospitals.map((h) => [h.hospital_code, h]));
  const marked = grid.rows.flatMap((r) => r.levels.flatMap((l, i) =>
    l === "much_higher" || l === "higher" || l === "lower" ? [{ code: r.code, week: grid.weeks[i] as string, level: l }] : []));
  if (!marked.length) return <p className="text-small text-muted">No week was marked higher or lower than usual.</p>;
  return (
    <table className="w-full text-left text-small">
      <thead><tr><th scope="col">Hospital</th><th scope="col">Week starting</th><th scope="col">Against usual</th></tr></thead>
      <tbody>
        {marked.map((m) => {
          const h = byCode.get(m.code);
          return (
            <tr key={`${m.code}|${m.week}`}>
              <td>{h ? <HospitalName hospital={h} /> : m.code}</td>
              <td className="tabular-nums">{formatAsOf(m.week)}</td>
              <td>{LEVELS[m.level].label}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
