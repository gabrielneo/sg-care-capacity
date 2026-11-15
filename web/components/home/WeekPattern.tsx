import { WeekdayHeatmap } from "@/components/edcharts/WeekdayHeatmap";
import { Provenance } from "@/components/Provenance";
import type { Hospital, Insight, Meta } from "@/lib/api/types";
import type { Profile } from "@/lib/edCompare";
import { formatWindow, PROFILE_WEEKS } from "@/lib/windows";

/** Which weekdays run long at each hospital: ED Trends' weekday heatmap, compared with each hospital's own average. */
export function WeekPattern({ profiles, hospitals, finding, meta }: { profiles: Profile[]; hospitals: Hospital[]; finding: Insight | null; meta: Meta }) {
  const shown = hospitals.filter((h) => profiles.some((p) => p.code === h.hospital_code));
  return (
    <section aria-labelledby="week-heading" className="py-8" data-testid="week-pattern">
      <h2 id="week-heading" className="font-semibold text-ink text-h2">Which days have the longest bed waits?</h2>
      <p className="mb-3 mt-1 max-w-prose text-small text-muted">
        Each day&apos;s bed wait over the {formatWindow({ kind: "weeks", n: PROFILE_WEEKS })}, compared with that hospital&apos;s own average. Orange is longer, purple is shorter.
      </p>
      <div className="rounded-xl border border-line bg-surface card">
        <WeekdayHeatmap profiles={profiles} hospitals={shown} mode="usual" finding={finding} />
      </div>
      <Provenance meta={meta} compact />
    </section>
  );
}
