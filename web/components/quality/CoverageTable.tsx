import { CELL_LABELS, type CellState, type CoverageRow } from "@/lib/coverage";

const STATES: CellState[] = ["both", "wait_only", "attendance_only", "missing", "not_expected"];

/** The coverage grid as counts: for each hospital, how many days fall in each state. */
export function CoverageTable({ rows, days }: { rows: CoverageRow[]; days: number }) {
  return (
    <table className="w-full min-w-140 border-separate border-spacing-0 text-meta tabular-nums" data-testid="coverage-counts">
      <caption className="sr-only">For each hospital, the number of days in each reporting state across {days} days</caption>
      <thead>
        <tr>
          <th scope="col" className="pr-3 text-left font-semibold text-muted">Hospital</th>
          {STATES.map((s) => <th key={s} scope="col" className="px-2 text-right font-semibold text-muted">{CELL_LABELS[s]}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.code}>
            <th scope="row" className="border-t border-line py-2 pr-3 text-left font-normal">{r.name} ({r.code})</th>
            {STATES.map((s) => <td key={s} className="border-t border-line px-2 text-right">{r.counts[s]}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
