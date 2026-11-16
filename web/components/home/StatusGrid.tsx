import { Prose } from "@/components/Prose";
import { SectionHeader } from "@/components/SectionHeader";
import { Glossed } from "@/components/terms/Glossed";
import { Term } from "@/components/terms/Term";
import type { Hospital, LiveReading, Meta } from "@/lib/api/types";
import type { Density } from "@/lib/homeViews";
import { levelSplitLede } from "@/lib/ledes";
import { shortNote } from "@/lib/hospitalNotes";
import { splitByCare, URGENT_CARE_HEADING, URGENT_CARE_NOTE } from "@/lib/hospitals";
import { acrossHospitals, type Sort } from "@/lib/planner";
import { type HospitalStatus, HIGHER_PCT, levelCounts, MUCH_HIGHER_PCT, SPARK_WEEKS } from "@/lib/status";
import type { WeekRange } from "@/lib/weeks";

import { SortControl } from "./SortControl";
import { Sparkline } from "./Sparkline";
import { StatusCard } from "./StatusCard";
import { formatWindow, USUAL_WEEKS } from "@/lib/windows";

/**
 * Every public ED as a status card, in the order given, and the urgent care centre in its own group. `density` is the view's (lib/homeViews.ts).
 * Full cards (globals.css, ".sc-grid"): one column below 768px, two to 1279px, four from 1280px, rows lined up by subgrid; the
 * urgent care centre is one full-width card under the grid. `sort` adds the order control (lib/planner.ts), which the Planner
 * and Analyst views have; it sits in the header's first row from 768px.
 */
export function StatusGrid({ statuses, hospitals, live, meta, latestWeek, density = "full", sort, query = "" }: {
  statuses: HospitalStatus[]; hospitals: Hospital[]; live: LiveReading[]; meta: Meta; latestWeek: WeekRange | null; density?: Density;
  sort?: Sort; query?: string }) {
  const full = density === "full";
  const middle = acrossHospitals(statuses, hospitals);
  // The full EDs in the order given; the urgent care centre in its own group below (ADR 0012).
  const { rankable, urgentCare } = splitByCare(statuses, (s) => s.code, hospitals);
  const gridClass = full ? "sc-grid" : "card-grid sm:grid-cols-2 lg:grid-cols-3";
  const byCode = new Map(hospitals.map((h) => [h.hospital_code, h]));
  const liveFor = (code: string) => live.find((r) => r.hospital_code === code && r.is_adult_ed) ?? null;
  const noteFor = (code: string) => {
    const h = byCode.get(code);
    return h ? shortNote(h) : null;
  };
  // What MOH leaves out altogether (the same text on every row of its hospital list).
  const exclusions = hospitals.find((h) => h.exclusions_note)?.exclusions_note ?? null;
  return (
    <section aria-labelledby="status-heading" className={full ? "py-2" : "py-8"} data-testid="status-grid" data-density={density}
             data-sort={sort}>
      <SectionHeader id="status-heading" title="How did each hospital compare with its own usual week?" meta={meta}
                     window={formatWindow({ kind: "latest_week", week: latestWeek }, { capital: true })}
                     lede={levelSplitLede(levelCounts(rankable))}
                     measureLabel="What the badges mean"
                     measure={
                       <span data-testid="status-key">
                         <span className="block">Usual = the median of the previous {USUAL_WEEKS} complete weeks.</span>
                         <span className="mt-1 block">Higher = {HIGHER_PCT}% or more above usual; much higher = {MUCH_HIGHER_PCT}% or more; both also need a move well outside that hospital&apos;s own usual swings.</span>
                         {full ? <span className="mt-1 block">To see a doctor is a <Term id="nuhs" /> estimate. <Term id="nuhs" plain /> publishes it separately, with its own time on each card, so it can be newer than the weekly figures.</span> : null}
                         {full ? <span className="mt-1 block">{`The line shows the ${formatWindow({ kind: "weeks", n: SPARK_WEEKS })}. The shaded band is the usual range: a week has to leave it to earn a badge.`}</span> : null}
                       </span>
                     }
                     aside={full ? (
                       <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
                         {middle.some((v) => v != null) ? (
                           <figure className="m-0 flex items-center gap-3" data-testid="median-trend">
                             <Sparkline values={middle} tone="none" />
                             <figcaption className="text-meta text-muted">Typical bed wait across emergency departments,<br />{formatWindow({ kind: "weeks", n: SPARK_WEEKS })}</figcaption>
                           </figure>
                         ) : null}
                       </div>
                     ) : null}
                     actions={full && sort ? <SortControl sort={sort} query={query} /> : null} />
      <ul className={gridClass} data-testid="status-group" data-group="ed">
        {rankable.map((s) => (
          <StatusCard key={s.code} status={s} hospital={byCode.get(s.code)} note={noteFor(s.code)} live={liveFor(s.code)} weeklyAsOf={meta.as_of} density={density} />
        ))}
      </ul>
      {urgentCare.length ? (
        <div className="mt-4" data-testid="status-ucc">
          <h3 className="font-semibold text-ink text-h3">{URGENT_CARE_HEADING}</h3>
          <Prose size="small" tone="muted">{URGENT_CARE_NOTE}.</Prose>
          <ul className={gridClass} data-testid="status-group" data-group="ucc">
            {urgentCare.map((s) => (
              <StatusCard key={s.code} status={s} hospital={byCode.get(s.code)} note={noteFor(s.code)} live={liveFor(s.code)} weeklyAsOf={meta.as_of} density={density} wide />
            ))}
          </ul>
        </div>
      ) : null}
      {exclusions ? (
        <Prose size="meta" tone="muted" className="mt-3" data-testid="status-exclusions"><Glossed text={exclusions} /></Prose>
      ) : null}
    </section>
  );
}
