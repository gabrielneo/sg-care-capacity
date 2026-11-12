import Link from "next/link";

import { Provenance } from "@/components/Provenance";
import { Glossed } from "@/components/terms/Glossed";
import type { Hospital, LiveReading, Meta } from "@/lib/api/types";
import { BED_WAIT_SHORT } from "@/lib/copy";
import type { Density } from "@/lib/homeViews";
import { shortNote } from "@/lib/hospitalNotes";
import { type Sort, sortHref, SORTS } from "@/lib/planner";
import { type HospitalStatus, HIGHER_PCT, MUCH_HIGHER_PCT } from "@/lib/status";
import { formatWeek, type WeekRange } from "@/lib/weeks";

import { StatusCard } from "./StatusCard";

/**
 * The order of the cards, as links: the order is in the URL (?sort=), so it can be shared and works
 * without JavaScript, like the view. `query` is the page's current query string, which each link keeps.
 */
function SortLinks({ sort, query }: { sort: Sort; query: string }) {
  return (
    <nav aria-label="Order of the hospitals" className="flex items-center gap-2 text-sm" data-testid="sort-links">
      <span className="text-muted" aria-hidden="true">Order by</span>
      <ul className="inline-flex rounded-md border border-line bg-surface p-1">
        {SORTS.map((s) => (
          <li key={s.id}>
            <Link href={sortHref(s.id, query)} scroll={false} aria-current={s.id === sort ? "true" : undefined}
                  className={"flex min-h-9 items-center rounded border px-3 font-medium no-underline "
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
 * Every public ED as a status card, in the order given. `density` is the view's (lib/homeViews.ts).
 * Full cards are smaller and sit four to a row on a wide screen; `sort` adds the order control
 * (lib/planner.ts), which the Planner and Analyst views have.
 */
export function StatusGrid({ statuses, hospitals, live, meta, latestWeek, density = "full", sort, query = "" }: {
  statuses: HospitalStatus[]; hospitals: Hospital[]; live: LiveReading[]; meta: Meta; latestWeek: WeekRange | null; density?: Density;
  sort?: Sort; query?: string }) {
  const full = density === "full";
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
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div>
          <h2 id="status-heading" className="text-xl font-semibold tracking-tight text-ink">
            {full ? `Each hospital, week of ${latestWeek ? formatWeek(latestWeek) : "last week"}` : "How busy were hospital emergency departments last week?"}
          </h2>
          {full ? null : (
            <p className="mt-1 max-w-prose text-sm text-muted">
              {latestWeek ? <>Week of {formatWeek(latestWeek)}, compared with each hospital&apos;s own usual week. </> : null}
              <Glossed text={BED_WAIT_SHORT} />
            </p>
          )}
        </div>
        {full && sort ? <SortLinks sort={sort} query={query} /> : null}
      </div>
      <ul className={full ? "mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"}>
        {statuses.map((s) => (
          <StatusCard key={s.code} status={s} note={noteFor(s.code)} live={liveFor(s.code)} density={density} />
        ))}
      </ul>
      {full ? <p className="mt-3 max-w-prose text-xs text-muted" data-testid="status-definition"><Glossed text={BED_WAIT_SHORT} /></p> : null}
      <p className={`${full ? "mt-1" : "mt-3"} text-xs text-muted`} data-testid="status-key">
        Usual = the middle of the 8 weeks before. Higher = {HIGHER_PCT}% or more above usual; much higher = {MUCH_HIGHER_PCT}% or more.
        {full ? ` The line shows the last 12 weeks. The shaded band is the usual range: within ${HIGHER_PCT}% of usual.` : null}
      </p>
      {exclusions ? (
        <p className="mt-1 text-xs text-muted" data-testid="status-exclusions"><Glossed text={exclusions} /></p>
      ) : null}
      <Provenance meta={meta} compact />
    </section>
  );
}
