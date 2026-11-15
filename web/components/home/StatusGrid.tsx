import Link from "next/link";

import { Prose } from "@/components/Prose";
import { Provenance } from "@/components/Provenance";
import { SectionHeading } from "@/components/SectionHeading";
import { Glossed } from "@/components/terms/Glossed";
import type { Hospital, LiveReading, Meta } from "@/lib/api/types";
import { BED_WAIT_SHORT } from "@/lib/copy";
import type { Density } from "@/lib/homeViews";
import { levelSplitLede } from "@/lib/ledes";
import { shortNote } from "@/lib/hospitalNotes";
import { splitByCare, URGENT_CARE_HEADING, URGENT_CARE_NOTE } from "@/lib/hospitals";
import { type Sort, sortHref, SORTS } from "@/lib/planner";
import { type HospitalStatus, HIGHER_PCT, levelCounts, MUCH_HIGHER_PCT, SPARK_WEEKS } from "@/lib/status";
import type { WeekRange } from "@/lib/weeks";

import { StatusCard } from "./StatusCard";
import { formatWindow, USUAL_WEEKS } from "@/lib/windows";

/**
 * The order of the cards, as links: the order is in the URL (?sort=), so it can be shared and works
 * without JavaScript, like the view. `query` is the page's current query string, which each link keeps.
 */
function SortLinks({ sort, query }: { sort: Sort; query: string }) {
  return (
    <nav aria-label="Order of the hospitals" className="flex items-center gap-2 text-small" data-testid="sort-links">
      <span className="text-muted" aria-hidden="true">Order by</span>
      <ul className="inline-flex rounded-md border border-control bg-surface p-1">
        {SORTS.map((s) => (
          <li key={s.id}>
            <Link href={sortHref(s.id, query)} scroll={false} aria-current={s.id === sort ? "true" : undefined}
                  className={"flex min-h-11 items-center rounded border px-3 font-semibold link-quiet "
                    + (s.id === sort ? "border-accent bg-accent-soft text-accent-strong" : "border-transparent text-muted hover:text-ink")}>
              {s.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Every public ED as a status card, in the order given, and the urgent care centre in its own group. `density` is the view's (lib/homeViews.ts).
 * Full cards are smaller and sit four to a row on a wide screen; `sort` adds the order control
 * (lib/planner.ts), which the Planner and Analyst views have.
 */
export function StatusGrid({ statuses, hospitals, live, meta, latestWeek, density = "full", sort, query = "" }: {
  statuses: HospitalStatus[]; hospitals: Hospital[]; live: LiveReading[]; meta: Meta; latestWeek: WeekRange | null; density?: Density;
  sort?: Sort; query?: string }) {
  const full = density === "full";
  // The full EDs in the order given; the urgent care centre in its own group below (ADR 0012).
  const { rankable, urgentCare } = splitByCare(statuses, (s) => s.code, hospitals);
  const gridClass = full ? "card-grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "card-grid sm:grid-cols-2 lg:grid-cols-3";
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
      <SectionHeading id="status-heading" aside={full && sort ? <SortLinks sort={sort} query={query} /> : null}
                      lede={full ? levelSplitLede(levelCounts(rankable)) : latestWeek
                        ? <>{formatWindow({ kind: "latest_week", week: latestWeek }, { capital: true })}, compared with each hospital&apos;s own usual week.</> : null}>
        {full ? `Each hospital, ${formatWindow({ kind: "latest_week", week: latestWeek })}` : "How long were bed waits at hospital emergency departments in the latest complete week?"}
      </SectionHeading>
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
              <StatusCard key={s.code} status={s} hospital={byCode.get(s.code)} note={noteFor(s.code)} live={liveFor(s.code)} weeklyAsOf={meta.as_of} density={density} />
            ))}
          </ul>
        </div>
      ) : null}
      <Prose size={full ? "meta" : "small"} tone="muted" className="mt-3" data-testid="status-definition"><Glossed text={BED_WAIT_SHORT} /></Prose>
      <Prose size="meta" tone="muted" className="mt-1" data-testid="status-key">
        Usual = the median of the previous {USUAL_WEEKS} complete weeks. Higher = {HIGHER_PCT}% or more above usual; much higher = {MUCH_HIGHER_PCT}% or more.
        {full ? ` The line shows the ${formatWindow({ kind: "weeks", n: SPARK_WEEKS })}. The shaded band is the usual range: within ${HIGHER_PCT}% of usual.` : null}
      </Prose>
      {exclusions ? (
        <Prose size="meta" tone="muted" className="mt-1" data-testid="status-exclusions"><Glossed text={exclusions} /></Prose>
      ) : null}
      <Provenance meta={meta} compact />
    </section>
  );
}
