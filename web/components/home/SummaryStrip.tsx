import { Provenance } from "@/components/Provenance";
import type { Meta } from "@/lib/api/types";
import { type HospitalStatus, LEVEL_ORDER, levelCounts } from "@/lib/status";
import { formatWeek, type WeekRange } from "@/lib/weeks";

import { StatusBadge } from "./StatusBadge";

/**
 * The week in one line, for a planner: how many hospitals carry each badge. It counts the badges on
 * the cards below and computes nothing else. "No comparison" is its own count, shown only when a
 * hospital has it, so a missing comparison is never read as "about usual".
 */
export function SummaryStrip({ statuses, meta, latestWeek, hasUcc }: {
  statuses: HospitalStatus[]; meta: Meta; latestWeek: WeekRange | null; hasUcc: boolean }) {
  if (!statuses.length) return null;
  const counts = levelCounts(statuses);
  const levels = LEVEL_ORDER.filter((l) => l !== "unknown" || counts[l] > 0);
  return (
    <section aria-labelledby="summary-heading" className="py-8" data-testid="summary-strip">
      <h2 id="summary-heading" className="text-xl font-semibold tracking-tight text-ink">Last week at a glance</h2>
      <p className="mt-1 max-w-prose text-sm text-muted">
        {latestWeek ? <>Week of {formatWeek(latestWeek)}. </> : null}
        {statuses.length} hospitals, each compared with its own usual week for the wait for a ward bed.
        {hasUcc ? " The urgent care centre is counted too, against its own usual week." : null}
      </p>
      <ul className="mt-4 flex flex-wrap gap-3">
        {levels.map((l) => (
          <li key={l} className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-sm sm:w-auto"
              data-testid="summary-count" data-level={l}>
            <span className="text-3xl font-semibold tabular-nums tracking-tight text-ink" data-testid="summary-number">{counts[l]}</span>
            <span className="sr-only">{counts[l] === 1 ? "hospital" : "hospitals"}:</span>
            <StatusBadge level={l} />
          </li>
        ))}
      </ul>
      <Provenance meta={meta} compact />
    </section>
  );
}
