import type { Hospital, Insight } from "@/lib/api/types";
import type { Mode, Usual } from "@/lib/edCompare";
import { pinnedCaveat } from "@/lib/hospitalNotes";
import { splitByCare, URGENT_CARE_HEADING, URGENT_CARE_NOTE } from "@/lib/hospitals";
import { type Level, levelFor } from "@/lib/status";

import { CaveatChip } from "../CaveatChip";
import { DeltaNumber } from "../story/DeltaNumber";
import { Glossed } from "../terms/Glossed";
import { hours, signed } from "./format";
import { USUAL_WEEKS } from "@/lib/windows";
import { HospitalName } from "@/components/HospitalName";

/** The dot's colour by badge level (static class names, so Tailwind sees them). */
const DOT: Record<Level, string> = { much_higher: "bg-status-much", higher: "bg-status-higher", usual: "bg-status-usual", lower: "bg-status-lower", unknown: "bg-accent" };
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
  const pos = (v: number) => (mode === "raw" ? (100 * v) / (top * 1.05) : 50 + (50 * v) / (m * 1.1));
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
    const level = levelFor(u.pct, u.position);
    const sign = level === "much_higher" || level === "higher" ? 1 : level === "lower" ? -1 : 0;
    const direction = sign > 0 ? "worse" : sign < 0 ? "better" : "neutral";
    return (
      <li key={code} data-testid="dumbbell-row" data-hospital={code} data-annotated={annotated ? "" : undefined}
          className={`grid gap-x-3 gap-y-1 sm:grid-cols-[8rem_minmax(0,1fr)_14rem] sm:items-center ${annotated ? "rounded-md bg-accent-soft p-2" : ""}`}>
        <span className="text-small font-semibold text-ink"><HospitalName hospital={h} /></span>
        <span className="dumbbell-track relative block h-6" aria-hidden="true" style={{ ["--delay" as string]: `${index * 90}ms` }}>
          {mode === "usual" ? <span className="absolute inset-y-0 left-1/2 w-px bg-ink" /> : null}
          <span className="dumbbell-bar absolute top-1/2 h-0.5 -translate-y-1/2 bg-muted"
                style={{ left: `${Math.min(a, b)}%`, width: `${Math.abs(b - a)}%`, transformOrigin: b >= a ? "left center" : "right center" }} />
          {mode === "raw" ? (
            <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-muted bg-surface"
                  style={{ left: `${a}%` }} />
          ) : null}
          <span className={`dumbbell-dot absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${DOT[level]}`}
                style={{ left: `${b}%`, ["--dx" as string]: a - b }} data-testid="dumbbell-latest" data-level={level} />
        </span>
        <DeltaNumber compact direction={direction} change={sign > 0 ? "up" : sign < 0 ? "down" : null}
                     value={mode === "raw" ? `${hours(u.latest)} hours` : `${signed(u.pct, 0)}%`}
                     unit={mode === "raw" ? `vs ${hours(u.usual)} usual` : null}
                     word={WORD[level]} />
        {annotated && finding?.chart ? (
          <p className="text-meta font-semibold text-ink sm:col-start-2" data-testid="chart-callout">
            <span aria-hidden="true">↑ </span>{finding.chart.callout} (the unusual-week finding)
          </p>
        ) : null}
        {mode === "raw" && note ? (
          <div className="sm:col-start-2" data-testid="pinned-caveat"><CaveatChip><Glossed text={note} /></CaveatChip></div>
        ) : null}
      </li>
    );
  };

  const counts = { higher: 0, usual: 0, lower: 0 };
  for (const { u } of eds) {
    const level = levelFor(u.pct, u.position);
    counts[level === "much_higher" || level === "higher" ? "higher" : level === "lower" ? "lower" : "usual"] += 1;
  }
  const edMissing = missing.filter((h) => splitByCare([h], (x) => x.hospital_code, hospitals).rankable.length).length;
  const tally = `Of ${eds.length} emergency ${eds.length === 1 ? "department" : "departments"} with a comparison: ${counts.higher} higher than usual, ${counts.usual} about usual, ${counts.lower} lower than usual.${edMissing ? ` ${edMissing} with no comparison.` : ""}${ucc.length ? " The urgent care centre is not counted." : ""}`;

  return (
    <div data-animate={animate ? "" : undefined}>
      {rows.length ? (
        <>
          <p className="mb-3 text-small font-semibold text-ink" data-testid="dumbbell-tally">{tally}</p>
          <ol className="space-y-3" data-testid="dumbbell" data-group="ed">
            {eds.map((r, i) => item(r, i))}
          </ol>
          {ucc.length ? (
            <div className="mt-4" data-testid="dumbbell-ucc">
              <p className="mb-2 text-small font-semibold text-ink">
                {URGENT_CARE_HEADING} <span className="font-normal text-muted">· {URGENT_CARE_NOTE}</span>
              </p>
              <ol className="space-y-3" data-group="ucc">
                {ucc.map((r, i) => item(r, eds.length + i))}
              </ol>
            </div>
          ) : null}
        </>
      ) : (
        <p className="text-small text-muted">No hospital has a complete latest week and {USUAL_WEEKS} complete weeks before it.</p>
      )}
      <p className="mt-3 text-meta text-muted" data-testid="dumbbell-legend">
        {mode === "raw"
          ? "Hollow dot: usual level. Filled dot: the latest complete week. Hours, average of each day's median."
          : "Dot: the latest complete week, as a % above (right) or below (left) the hospital's own usual level (the line)."}
        {" "}{`A hospital counts as higher or lower than usual only when the move is at least 15% and takes it beyond every one of the ${USUAL_WEEKS} weeks before; otherwise it reads "about usual".`}
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
