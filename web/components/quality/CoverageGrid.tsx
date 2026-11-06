import { CELL_LABELS, type CellState, type CoverageRow, dateRuns } from "@/lib/coverage";

import { Glossed } from "../terms/Glossed";
import { Term } from "../terms/Term";

const CELL = 7;
const GAP = 1;
const LABEL_W = 56;
const ROW_H = 16;
const TOP = 18;

/** States differ by fill pattern and lightness, not hue, so they read without colour vision. */
const FILL: Record<CellState, string> = {
  both: "#475569",
  wait_only: "url(#cov-partial)",
  attendance_only: "url(#cov-partial)",
  missing: "#FFFFFF",
  not_expected: "url(#cov-not-expected)",
};

function Defs() {
  return (
    <defs>
      <pattern id="cov-partial" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="4" height="4" fill="#FFFFFF" />
        <rect width="2" height="4" fill="#475569" />
      </pattern>
      <pattern id="cov-not-expected" width="4" height="4" patternUnits="userSpaceOnUse">
        <rect width="4" height="4" fill="#F8FAFC" />
        <circle cx="2" cy="2" r="0.7" fill="#94A3B8" />
      </pattern>
    </defs>
  );
}

function Swatch({ state }: { state: CellState }) {
  return (
    <svg width="14" height="14" aria-hidden="true">
      <Defs />
      <rect x="0.5" y="0.5" width="13" height="13" fill={FILL[state]} stroke={state === "missing" ? "#991B1B" : "#94A3B8"} />
    </svg>
  );
}

export function CoverageGrid({ days, rows }: { days: string[]; rows: CoverageRow[] }) {
  const width = LABEL_W + days.length * (CELL + GAP);
  const height = TOP + rows.length * ROW_H;
  const months = days.flatMap((d, i) => (i === 0 || d.endsWith("-01") ? [{ i, label: new Date(`${d}T00:00:00Z`).toLocaleString("en-SG", { month: "short", timeZone: "UTC" }) }] : []));
  const total = (s: CellState) => rows.reduce((n, r) => n + r.counts[s], 0);
  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Legend">
        {(Object.keys(CELL_LABELS) as CellState[]).filter((s) => s !== "attendance_only").map((s) => (
          <li key={s} className="flex items-center gap-1.5">
            <Swatch state={s} />
            {s === "wait_only" ? "Only one of the two figures" : <Glossed text={CELL_LABELS[s]} />}
          </li>
        ))}
      </ul>
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Coverage grid, hospital by day (scrolls sideways)">
        <svg width={width} height={height} role="img" data-testid="coverage-grid"
             aria-label={`${rows.length} hospitals by ${days.length} days, ${days[0]} to ${days.at(-1)}: ${total("both")} hospital-days with both figures, ${total("wait_only") + total("attendance_only")} with one, ${total("missing")} missing, ${total("not_expected")} before a site was reported. Missing dates are listed below.`}>
          <Defs />
          {months.map((m) => (
            <text key={m.i} x={LABEL_W + m.i * (CELL + GAP)} y={11} fontSize="10" fill="#475569">{m.label}</text>
          ))}
          {rows.map((r, ri) => (
            <g key={r.code} transform={`translate(0 ${TOP + ri * ROW_H})`}>
              <text x={0} y={CELL + 3} fontSize="11" fill="#0F172A" fontWeight="600">{r.code}</text>
              {r.cells.map((s, ci) => (
                <rect key={days[ci]} x={LABEL_W + ci * (CELL + GAP)} y={0} width={CELL} height={ROW_H - 4} rx={1} fill={FILL[s]}
                      stroke={s === "missing" ? "#991B1B" : "none"} strokeWidth={s === "missing" ? 1 : 0} data-state={s}>
                  <title>{`${r.code} ${days[ci]}: ${CELL_LABELS[s]}`}</title>
                </rect>
              ))}
            </g>
          ))}
        </svg>
      </div>
      <h3 className="mt-4 text-sm font-semibold">Days with a figure missing</h3>
      <ul className="mt-1 space-y-1 text-sm" data-testid="coverage-gaps">
        {rows.map((r) => {
          const missing = r.gaps.filter((g) => g.state === "missing").map((g) => g.date);
          const partial = r.gaps.filter((g) => g.state !== "missing").map((g) => g.date);
          return (
            <li key={r.code}>
              <span className="font-medium"><Term id={r.code.toLowerCase()} /></span>{" "}
              {r.gaps.length === 0 ? (
                <span className="text-muted">none</span>
              ) : (
                <>
                  {missing.length ? <span>missing: {dateRuns(missing).join(", ")}</span> : null}
                  {missing.length && partial.length ? "; " : null}
                  {partial.length ? <span>one figure only: {dateRuns(partial).join(", ")}</span> : null}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
