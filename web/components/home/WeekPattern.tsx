import { WeekdayHeatmap } from "@/components/edcharts/WeekdayHeatmap";
import { Provenance } from "@/components/Provenance";
import type { Hospital, Insight, Meta } from "@/lib/api/types";
import type { Profile } from "@/lib/edCompare";

/** Which weekdays run long at each hospital: ED Trends' weekday heatmap, compared with each hospital's own average. */
export function WeekPattern({ profiles, hospitals, finding, meta }: { profiles: Profile[]; hospitals: Hospital[]; finding: Insight | null; meta: Meta }) {
  const shown = hospitals.filter((h) => profiles.some((p) => p.code === h.hospital_code));
  return (
    <section aria-labelledby="week-heading" className="py-8" data-testid="week-pattern">
      <h2 id="week-heading" className="text-xl font-semibold tracking-tight text-ink">Which days are busiest?</h2>
      <p className="mb-3 mt-1 max-w-prose text-sm text-muted">
        Each day&apos;s bed wait over the last 26 weeks, compared with that hospital&apos;s own average. Orange is longer, purple is shorter.
      </p>
      <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
        <WeekdayHeatmap profiles={profiles} hospitals={shown} mode="usual" finding={finding} />
      </div>
      <Provenance meta={meta} compact />
    </section>
  );
}
