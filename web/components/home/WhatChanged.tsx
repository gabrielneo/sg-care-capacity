import { Prose } from "@/components/Prose";
import { SectionHeader } from "@/components/SectionHeader";
import type { Meta } from "@/lib/api/types";
import { changesLede } from "@/lib/ledes";
import { LEVELS } from "@/lib/status";
import { formatWindow } from "@/lib/windows";
import { formatWeek, type WeekRange } from "@/lib/weeks";
import type { WeekChanges } from "@/lib/weekChanges";

/**
 * "What changed": the hospitals whose badge moved since the week before, from the same weekly
 * figures as the cards. When nothing moved it says so, because a quiet week is a result, not a gap.
 * A hospital with no comparison in either week is counted apart, never as "unchanged".
 */
export function WhatChanged({ changes, names, meta, latestWeek, higher = null }: {
  changes: WeekChanges; names: Record<string, string>; meta: Meta; latestWeek: WeekRange | null;
  /** How many full EDs are higher or much higher than usual this week (null when unknown); 0 with no badge moves is the "nothing longer" sentence. */
  higher?: number | null }) {
  if (!changes.previousWeek || !latestWeek) return null;
  const before = formatWeek({ week_start: changes.previousWeek, week_end: new Date(Date.parse(`${changes.previousWeek}T00:00:00Z`) + 6 * 86_400_000).toISOString().slice(0, 10) });
  const { moved, unchanged, notCompared } = changes;
  return (
    <section aria-labelledby="changes-heading" className="py-6" data-testid="what-changed">
      <SectionHeader id="changes-heading" title="Which hospitals changed badge since the week before?" meta={meta}
                     window={formatWindow({ kind: "latest_week", week: latestWeek }, { capital: true })}
                     lede={changesLede(moved.length, unchanged, higher)} ledeTestId={moved.length ? "changes-lede" : "changes-none"} />
      {moved.length ? (
        <ul className="space-y-1 text-body text-ink" data-testid="changes-list">
          {moved.map((m) => (
            <li key={m.code} data-testid="change-item" data-direction={m.step > 0 ? "longer" : "shorter"}>
              <span className="font-semibold">{names[m.code] ?? m.code}</span>
              {`: ${LEVELS[m.from].label.toLowerCase()} → ${LEVELS[m.to].label.toLowerCase()}`}
            </li>
          ))}
        </ul>
      ) : null}
      <Prose size="small" tone="muted" className="mt-3" data-testid="changes-counts">
        Week of {formatWeek(latestWeek)} compared with {before}. A badge compares a week with the hospital&apos;s own usual.
        {" "}{unchanged} kept the same badge{notCompared ? `; ${notCompared} could not be compared (not enough complete weeks)` : ""}.
      </Prose>
    </section>
  );
}
