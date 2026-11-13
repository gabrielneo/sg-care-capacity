import { FreshnessBadge } from "@/components/FreshnessBadge";
import type { Meta } from "@/lib/api/types";
import { cadenceFor } from "@/lib/freshness";
import { LEVELS } from "@/lib/status";
import { formatWeek, type WeekRange } from "@/lib/weeks";
import type { WeekChanges } from "@/lib/weekChanges";

/**
 * "What changed": the hospitals whose badge moved since the week before, from the same weekly
 * figures as the cards. When nothing moved it says so, because a quiet week is a result, not a gap.
 * A hospital with no comparison in either week is counted apart, never as "unchanged".
 */
export function WhatChanged({ changes, names, meta, latestWeek }: {
  changes: WeekChanges; names: Record<string, string>; meta: Meta; latestWeek: WeekRange | null }) {
  if (!changes.previousWeek || !latestWeek) return null;
  const before = formatWeek({ week_start: changes.previousWeek, week_end: new Date(Date.parse(`${changes.previousWeek}T00:00:00Z`) + 6 * 86_400_000).toISOString().slice(0, 10) });
  const { moved, unchanged, notCompared } = changes;
  return (
    <section aria-labelledby="changes-heading" className="py-6" data-testid="what-changed">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 id="changes-heading" className="text-xl font-semibold tracking-tight text-ink">What changed since the week before</h2>
        <FreshnessBadge asOf={meta.as_of} cadence={cadenceFor(meta)} />
      </div>
      <p className="mt-1 text-sm text-muted">Week of {formatWeek(latestWeek)} compared with {before}. A badge compares a week with the hospital&apos;s own usual.</p>
      {moved.length ? (
        <ul className="mt-3 space-y-1 text-base text-ink" data-testid="changes-list">
          {moved.map((m) => (
            <li key={m.code} data-testid="change-item" data-direction={m.step > 0 ? "busier" : "quieter"}>
              <span className="font-medium">{names[m.code] ?? m.code}</span>
              {`: ${LEVELS[m.from].label.toLowerCase()} → ${LEVELS[m.to].label.toLowerCase()}`}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-base text-ink" data-testid="changes-none">No hospital changed its badge since the week before.</p>
      )}
      <p className="mt-2 text-sm text-muted" data-testid="changes-counts">
        {unchanged} kept the same badge{notCompared ? `; ${notCompared} could not be compared (not enough complete weeks)` : ""}.
      </p>
    </section>
  );
}
