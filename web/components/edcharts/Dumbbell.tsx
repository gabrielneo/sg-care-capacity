import type { Hospital, Insight } from "@/lib/api/types";
import type { Mode, Usual } from "@/lib/edCompare";
import { pinnedCaveat } from "@/lib/hospitalNotes";

import { CaveatChip } from "../CaveatChip";
import { DeltaNumber } from "../story/DeltaNumber";
import { Glossed } from "../terms/Glossed";
import { Term } from "../terms/Term";
import { hours, signed } from "./format";

/**
 * Usual level (median of the 8 complete weeks before) against the latest complete week, one row per
 * hospital, sorted by the size of the difference. "vs usual": a lollipop of the % difference about 0.
 * Raw: a dumbbell in hours, usual (hollow) to latest (filled). HTML rows, so it reflows at any width.
 */
export function Dumbbell({ usuals, hospitals, mode, finding }: {
  usuals: Record<string, Usual>; hospitals: Hospital[]; mode: Mode; finding: Insight | null }) {
  const rows = hospitals.map((h) => ({ h, u: usuals[h.hospital_code] })).filter((r) => r.u?.diff != null) as
    { h: Hospital; u: Usual & { usual: number; latest: number; diff: number; pct: number } }[];
  const missing = hospitals.filter((h) => usuals[h.hospital_code]?.diff == null);
  rows.sort((a, b) => (mode === "raw" ? Math.abs(b.u.diff) - Math.abs(a.u.diff) : Math.abs(b.u.pct) - Math.abs(a.u.pct)));
  const m = Math.max(1, ...rows.map((r) => Math.abs(mode === "raw" ? 0 : r.u.pct)));
  const top = Math.max(1, ...rows.flatMap((r) => [r.u.usual, r.u.latest]));
  const pos = (v: number) => (mode === "raw" ? (100 * v) / (top * 1.05) : 50 + (50 * v) / (m * 1.1));

  return (
    <div>
      {rows.length ? (
        <ol className="space-y-3" data-testid="dumbbell">
          {rows.map(({ h, u }) => {
            const code = h.hospital_code;
            const annotated = finding?.entity === code;
            const a = mode === "raw" ? pos(u.usual) : 50;
            const b = mode === "raw" ? pos(u.latest) : pos(u.pct);
            const note = pinnedCaveat(h);
            // Equal as shown (one decimal, or a whole %) reads as the same, with no arrow (audit L-9).
            const same = mode === "raw" ? hours(u.latest) === hours(u.usual) : Math.round(u.pct) === 0;
            const sign = same ? 0 : Math.sign(u.diff);
            const direction = sign > 0 ? "worse" : sign < 0 ? "better" : "neutral";
            return (
              <li key={code} data-testid="dumbbell-row" data-hospital={code} data-annotated={annotated ? "" : undefined}
                  className={`grid gap-x-3 gap-y-1 sm:grid-cols-[8rem_minmax(0,1fr)_14rem] sm:items-center ${annotated ? "rounded-md bg-accent-soft p-2" : ""}`}>
                <span className="text-sm font-medium text-ink"><Term id={code.toLowerCase()} /></span>
                <span className="relative block h-6" aria-hidden="true">
                  {mode === "usual" ? <span className="absolute inset-y-0 left-1/2 w-px bg-ink" /> : null}
                  <span className="absolute top-1/2 h-0.5 -translate-y-1/2 bg-muted"
                        style={{ left: `${Math.min(a, b)}%`, width: `${Math.abs(b - a)}%` }} />
                  {mode === "raw" ? (
                    <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-muted bg-surface"
                          style={{ left: `${a}%` }} />
                  ) : null}
                  <span className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent"
                        style={{ left: `${b}%` }} data-testid="dumbbell-latest" />
                </span>
                <DeltaNumber compact direction={direction} change={sign > 0 ? "up" : sign < 0 ? "down" : null}
                             value={mode === "raw" ? `${hours(u.latest)} hours` : `${signed(u.pct, 0)}%`}
                             unit={mode === "raw" ? `vs ${hours(u.usual)} usual` : null}
                             word={sign > 0 ? "higher than usual" : sign < 0 ? "lower than usual" : "about the same as usual"} />
                {annotated && finding?.chart ? (
                  <p className="text-xs font-medium text-ink sm:col-start-2" data-testid="chart-callout">
                    <span aria-hidden="true">↑ </span>{finding.chart.callout} (the unusual-week finding)
                  </p>
                ) : null}
                {mode === "raw" && note ? (
                  <div className="sm:col-start-2" data-testid="pinned-caveat"><CaveatChip><Glossed text={note} /></CaveatChip></div>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="text-sm text-muted">No hospital has a complete latest week and 8 complete weeks before it.</p>
      )}
      <p className="mt-3 text-xs text-muted" data-testid="dumbbell-legend">
        {mode === "raw"
          ? "Hollow dot: usual level. Filled dot: the latest complete week. Hours, average of each day's median."
          : "Dot: the latest complete week, as a % above (right) or below (left) the hospital's own usual level (the line)."}
      </p>
      {missing.length ? (
        <p className="mt-1 text-xs text-muted" data-testid="dumbbell-missing">
          <Glossed text={`Not shown, as the usual level needs all 8 weeks complete: ${missing.map((h) => {
            const u = usuals[h.hospital_code];
            return `${h.hospital_code} (${u?.weeks ?? 0} of 8${u?.latest == null ? ", no complete latest week" : ""})`;
          }).join(", ")}.`} />
        </p>
      ) : null}
    </div>
  );
}
