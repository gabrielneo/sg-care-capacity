import { ChartFrame } from "@/components/ChartFrame";
import { WeekdayHeatmap } from "@/components/edcharts/WeekdayHeatmap";
import { Prose } from "@/components/Prose";
import { SectionHeader } from "@/components/SectionHeader";
import type { Hospital, Insight, Meta } from "@/lib/api/types";
import type { Profile } from "@/lib/edCompare";
import { formatWindow, PROFILE_WEEKS } from "@/lib/windows";

/** Which weekdays run long at each hospital: ED Trends' weekday heatmap, compared with each hospital's own average. */
export function WeekPattern({ profiles, hospitals, finding, meta, from, to }: {
  profiles: Profile[]; hospitals: Hospital[]; finding: Insight | null; meta: Meta; from: string; to: string }) {
  const shown = hospitals.filter((h) => profiles.some((p) => p.code === h.hospital_code));
  return (
    <section aria-labelledby="week-heading" className="py-8" data-testid="week-pattern">
      <SectionHeader id="week-heading" title="Which days have the longest bed waits?" lede={finding?.headline ?? null} ledeTestId="week-lede" meta={meta}
                     window={formatWindow({ kind: "weeks", n: PROFILE_WEEKS }, { capital: true })} />
      {/* The section's header already says what this is, and gives its date and source: the frame inherits them. */}
      <ChartFrame title="Bed wait by day of the week, by hospital" titleHidden headingLevel={3} meta={meta} section={meta}
                  csv={`/export/ed-daily.csv?from=${from}&to=${to}&context=1`} table="self"
                  summary={`A table of each hospital's bed wait on each day of the week, as % above or below its own average, over the ${PROFILE_WEEKS} weeks to ${to}.`}>
        <WeekdayHeatmap profiles={profiles} hospitals={shown} mode="usual" finding={finding} />
      </ChartFrame>
      <Prose size="small" tone="muted" className="mt-3">
        Each day&apos;s bed wait over the {formatWindow({ kind: "weeks", n: PROFILE_WEEKS })}, compared with that hospital&apos;s own average. Orange is longer, purple is shorter.
      </Prose>
    </section>
  );
}
