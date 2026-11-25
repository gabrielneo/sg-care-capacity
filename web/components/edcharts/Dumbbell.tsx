import Link from "next/link";

import type { Hospital, Insight } from "@/lib/api/types";
import type { Mode, Usual } from "@/lib/edCompare";
import { pinnedCaveat } from "@/lib/hospitalNotes";
import { isUrgentCare, splitByCare, URGENT_CARE_HEADING, URGENT_CARE_NOTE } from "@/lib/hospitals";
import { HIGHER_PCT, type Level, levelFor } from "@/lib/status";

import { CaveatChip } from "../CaveatChip";
import { DeltaNumber } from "../story/DeltaNumber";
import { Glossed } from "../terms/Glossed";
import { niceAxis, symmetricAxis, tickText } from "@/lib/axis";

import { hours, signed } from "./format";
import { USUAL_WEEKS } from "@/lib/windows";
import { HospitalName } from "@/components/HospitalName";

/** The latest week's dot is royal blue at every level (the brand's key data mark); the level is in the pill beside it, in words. */
const DOT: Record<Level, string> = { much_higher: "bg-data-mark", higher: "bg-data-mark", usual: "bg-data-mark", lower: "bg-data-mark", unknown: "bg-data-mark" };
const WORD: Record<Level, string> = { much_higher: "much higher than usual", higher: "higher than usual", usual: "about usual", lower: "lower than usual", unknown: "no comparison" };

/**
 * Usual level (median of the 8 complete weeks before) against the latest complete week, one row per
 * full ED, sorted by the size of the difference; the urgent care centre in its own group below. "vs usual": a lollipop of the % difference about 0.
 * Raw: a dumbbell in hours, usual (hollow) to latest (filled). HTML rows, so it reflows at any width.
 */
export function Dumbbell({ usuals, hospitals, mode, finding, animate = false }: {
  usuals: Record<string, Usual>; hospitals: Hospital[]; mode: Mode; finding: Insight | null;
  /** Landing page: the dots slide from "usual" to this week's value when the chart arrives (CSS only; the final picture is the same). */
  animate?: boolean }) {
  const rows = hospitals.map((h) => ({ h, u: usuals[h.hospital_code] })).filter((r) => r.u?.diff != null) as
    { h: Hospital; u: Usual & { usual: number; latest: number; diff: number; pct: number } }[];
  const missing = hospitals.filter((h) => usuals[h.hospital_code]?.diff == null);
  rows.sort((a, b) => (mode === "raw" ? Math.abs(b.u.diff) - Math.abs(a.u.diff) : Math.abs(b.u.pct) - Math.abs(a.u.pct)));
  const m = Math.max(1, ...rows.map((r) => Math.abs(mode === "raw" ? 0 : r.u.pct)));
  const top = Math.max(1, ...rows.flatMap((r) => [r.u.usual, r.u.latest]));
  // One common scale for every row, with round ticks, computed from the figures drawn (presentation only).
  const axis = mode === "raw" ? niceAxis(top, 6) : symmetricAxis(m, 2);
  const pos = (v: number) => (mode === "raw" ? (100 * v) / axis.max : 50 + (50 * v) / axis.max);
  const tickLabel = (t: number) => (mode === "raw" ? tickText(t, axis.step) : `${t > 0 ? "+" : t < 0 ? "−" : ""}${tickText(Math.abs(t), axis.step)}%`);
  // Name | track | figures from 1024px; below that the name and figures share a line and the track runs the full width under them.
  const GRID = "grid gap-x-4 sm:grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[15rem_minmax(0,1fr)_17rem]";
  const gridlines = (
    <>
      {axis.ticks.map((t) => (
        <span key={t} className={`absolute inset-y-0 w-px ${t === 0 && mode === "usual" ? "bg-ink" : "bg-line"}`} style={{ left: `${pos(t)}%` }} />
      ))}
    </>
  );
  // The EDs by size of change, then the urgent care centre on its own, never ranked among them (ADR 0012).
  const { rankable: eds, urgentCare: ucc } = splitByCare(rows, (r) => r.h.hospital_code, hospitals);
  const item = ({ h, u }: (typeof rows)[number], index: number) => {
    const code = h.hospital_code;
    const annotated = finding?.entity === code;
    const a = mode === "raw" ? pos(u.usual) : 50;
    const b = mode === "raw" ? pos(u.latest) : pos(u.pct);
    const note = pinnedCaveat(h);
    // The word, arrow and colour are the badge's (lib/status.ts: 15% or more AND outside the range of the 8 weeks before), so this chart,
    // the badge and "N of M above usual" always agree. A smaller move is "about usual": the figures still show it.
    const level = levelFor(u.pct, u.position, u.z);
    const sign = level === "much_higher" || level === "higher" ? 1 : level === "lower" ? -1 : 0;
    const direction = sign > 0 ? "worse" : sign < 0 ? "better" : "neutral";
    return (
      <li key={code} data-testid="dumbbell-row" data-hospital={code} data-annotated={annotated ? "" : undefined}
          className={`${GRID} gap-y-1 rounded-md px-2 py-2 hover:bg-sunken focus-within:bg-sunken lg:items-center ${annotated ? "bg-accent-soft hover:bg-accent-soft" : ""}`}>
        {/* The name opens the hospital's own page: month by month and year on year (app/hospital/[code]). */}
        <span className="min-w-0 text-small font-semibold sm:col-start-1 sm:row-start-1 lg:whitespace-nowrap">
          <Link href={`/hospital/${code}`} className="inline-flex min-h-11 items-center" data-testid="dumbbell-hospital-link">
            <HospitalName hospital={h} inControl />
            <span className="sr-only">, month by month and year on year</span>
          </Link>
        </span>
        <span className="dumbbell-track relative block h-8 sm:col-span-2 sm:row-start-2 lg:col-span-1 lg:col-start-2 lg:row-start-1" aria-hidden="true"
              style={{ ["--delay" as string]: `${index * 90}ms` }}>
          {gridlines}
          <span className="dumbbell-bar absolute top-1/2 h-0.5 -translate-y-1/2 bg-control"
                style={{ left: `${Math.min(a, b)}%`, width: `${Math.abs(b - a)}%`, transformOrigin: b >= a ? "left center" : "right center" }} />
          {mode === "raw" ? (
            <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-muted bg-surface"
                  style={{ left: `${a}%` }} />
          ) : null}
          <span className={`dumbbell-dot absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface ${DOT[level]}`}
                style={{ left: `${b}%`, ["--dx" as string]: a - b }} data-testid="dumbbell-latest" data-level={level} />
        </span>
        <span className="sm:col-start-2 sm:row-start-1 sm:text-right lg:col-start-3 lg:text-left">
          <DeltaNumber compact pill={level === "unknown" ? null : level} direction={direction} change={sign > 0 ? "up" : sign < 0 ? "down" : null}
                       value={mode === "raw" ? `${hours(u.latest)} hours` : `${signed(u.pct, 0)}%`}
                       unit={mode === "raw" ? `vs ${hours(u.usual)} usual` : null}
                       word={WORD[level]} />
          {/* Why a big move still reads "about usual": the week sits inside the range of the weeks before (lib/status.ts). */}
          {level === "usual" && Math.abs(u.pct) >= HIGHER_PCT && (u.z != null || u.position === 0) ? (
            <span className="block text-meta text-muted" data-testid="within-range">
              {u.z != null ? `within its own usual swing of about ±${hours(u.swing ?? 0)} (previous ${u.rangeWeeks} complete weeks)` : `within the range of its ${USUAL_WEEKS} weeks before`}
            </span>
          ) : null}
        </span>
        {annotated && finding?.chart ? (
          <p className="text-meta font-semibold text-ink sm:col-span-2 lg:col-span-1 lg:col-start-2" data-testid="chart-callout">
            <span aria-hidden="true">↑ </span>{finding.chart.callout} (the unusual-week finding)
          </p>
        ) : null}
        {note && (mode === "raw" || !isUrgentCare(h)) ? (
          <div className="sm:col-span-2 lg:col-span-1 lg:col-start-2" data-testid="pinned-caveat"><CaveatChip><Glossed text={note} /></CaveatChip></div>
        ) : null}
      </li>
    );
  };

  const counts = { higher: 0, usual: 0, lower: 0 };
  for (const { u } of eds) {
    const level = levelFor(u.pct, u.position, u.z);
    counts[level === "much_higher" || level === "higher" ? "higher" : level === "lower" ? "lower" : "usual"] += 1;
  }
  const edMissing = missing.filter((h) => splitByCare([h], (x) => x.hospital_code, hospitals).rankable.length).length;
  const tally = `Of ${eds.length} emergency ${eds.length === 1 ? "department" : "departments"} with a comparison: ${counts.higher} higher than usual, ${counts.usual} about usual, ${counts.lower} lower than usual.${edMissing ? ` ${edMissing} with no comparison.` : ""}${ucc.length ? " The urgent care centre is not counted." : ""}`;

  // The scale, once, above the rows: tick labels in the track's column, and the key to the dots beside the tally.
  const axisRow = (
    <div className={`${GRID} px-2`} aria-hidden="true" data-testid="dumbbell-axis">
      <span className="text-meta text-muted sm:col-span-2 lg:col-span-1">{mode === "raw" ? "Hours" : "Against usual"}</span>
      <span className="relative block h-5 text-meta tabular-nums text-muted sm:col-span-2 lg:col-span-1">
        {axis.ticks.map((t, i) => (
          <span key={t} className={`absolute top-0 whitespace-nowrap ${i === 0 ? "" : i === axis.ticks.length - 1 ? "-translate-x-full" : "-translate-x-1/2"}`}
                style={{ left: `${pos(t)}%` }}>
            {tickLabel(t)}
          </span>
        ))}
      </span>
    </div>
  );
  const key = mode === "raw" ? (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-muted" data-testid="dumbbell-legend">
      <li className="flex items-center gap-2"><span aria-hidden="true" className="h-3 w-3 rounded-full border-2 border-muted bg-surface" />Usual level</li>
      <li className="flex items-center gap-2"><span aria-hidden="true" className="h-3 w-3 rounded-full bg-data-mark" />Latest complete week</li>
    </ul>
  ) : (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-muted" data-testid="dumbbell-legend">
      <li className="flex items-center gap-2"><span aria-hidden="true" className="h-3 w-px bg-ink" />Usual level (0%)</li>
      <li className="flex items-center gap-2"><span aria-hidden="true" className="h-3 w-3 rounded-full bg-data-mark" />Latest complete week</li>
    </ul>
  );

  return (
    <div data-animate={animate ? "" : undefined}>
      {rows.length ? (
        <>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
            <p className="max-w-prose text-small font-semibold text-ink" data-testid="dumbbell-tally">{tally}</p>
            {key}
          </div>
          {axisRow}
          <ol className="mt-1 space-y-1" data-testid="dumbbell" data-group="ed">
            {eds.map((r, i) => item(r, i))}
          </ol>
          {ucc.length ? (
            <div className="mt-4 border-t border-line pt-4" data-testid="dumbbell-ucc">
              <p className="mb-2 px-2 text-small font-semibold text-ink">
                {URGENT_CARE_HEADING} <span className="font-normal text-muted">· {URGENT_CARE_NOTE}</span>
              </p>
              <ol className="space-y-1" data-group="ucc">
                {ucc.map((r, i) => item(r, eds.length + i))}
              </ol>
            </div>
          ) : null}
        </>
      ) : (
        <p className="text-small text-muted">No hospital has a complete latest week and {USUAL_WEEKS} complete weeks before it.</p>
      )}
      <p className="mt-3 text-meta text-muted" data-testid="dumbbell-note">
        {mode === "raw"
          ? "Hollow dot: usual level. Filled dot: the latest complete week. Hours, average of each day's median."
          : "Dot: the latest complete week, as a % above (right) or below (left) the hospital's own usual level (the line)."}
        {" "}{`A hospital counts as higher or lower than usual only when the move is at least ${HIGHER_PCT}% and takes it beyond every one of the ${USUAL_WEEKS} weeks before; otherwise it reads "about usual".`}
      </p>
      {missing.length ? (
        <p className="mt-1 text-meta text-muted" data-testid="dumbbell-missing">
          <Glossed text={`Not shown, as the usual level needs all ${USUAL_WEEKS} weeks complete: ${missing.map((h) => {
            const u = usuals[h.hospital_code];
            return `${h.hospital_code} (${u?.weeks ?? 0} of ${USUAL_WEEKS}${u?.latest == null ? ", no complete latest week" : ""})`;
          }).join(", ")}.`} />
        </p>
      ) : null}
    </div>
  );
}
