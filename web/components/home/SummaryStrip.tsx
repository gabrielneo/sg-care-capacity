import type { ReactNode } from "react";

import { FreshnessBadge } from "@/components/FreshnessBadge";
import { KpiTile } from "@/components/KpiTile";
import { Glossed } from "@/components/terms/Glossed";
import { Term } from "@/components/terms/Term";
import { Tip } from "@/components/terms/TermView";
import type { Hospital, Meta } from "@/lib/api/types";
import { BED_WAIT_SHORT } from "@/lib/copy";
import { cadenceFor } from "@/lib/freshness";
import { USUAL_WEEKS } from "@/lib/edCompare";
import { aboveUsual, acrossHospitals, formatDelta, largestChange, longestWait, MIN_HOSPITALS } from "@/lib/planner";
import { HIGHER_PCT, type HospitalStatus, levelCounts } from "@/lib/status";
import { formatWeek, type WeekRange } from "@/lib/weeks";

import { Sparkline } from "./Sparkline";

const hours = (v: number) => v.toFixed(1);
const name = (code: string) => <Term id={code.toLowerCase()} plain standalone />;

function Tile({ id, children }: { id: string; children: ReactNode }) {
  return <li data-testid="summary-tile" data-tile={id}>{children}</li>;
}

/**
 * The week in four numbers, for a planner: where is pressure unusual? Each tile reads the statuses
 * the cards below are drawn from (lib/planner.ts) and carries its own date and source.
 * - Above usual: the hospitals whose badge is higher or much higher. "No comparison" is said
 *   separately, so a missing comparison is never read as "not above usual".
 * - Longest bed wait and the middle across hospitals compare raw hours, so they leave out the
 *   urgent care centre, whose waits are shorter by design. The other two compare each hospital
 *   with itself, so it is in.
 */
export function SummaryStrip({ statuses, hospitals, meta, latestWeek }: {
  statuses: HospitalStatus[]; hospitals: Hospital[]; meta: Meta; latestWeek: WeekRange | null }) {
  if (!statuses.length) return null;
  const ucc = hospitals.filter((h) => h.facility_type === "UCC").map((h) => h.hospital_code);
  const above = aboveUsual(statuses);
  const noComparison = levelCounts(statuses).unknown;
  const longest = longestWait(statuses, ucc);
  const change = largestChange(statuses);
  const middle = acrossHospitals(statuses, ucc);
  const middleNow = middle.at(-1) ?? null;
  const fullEds = statuses.filter((s) => !ucc.includes(s.code) && s.latest != null).length;
  const uccNote = ucc.length ? " The urgent care centre isn't ranked." : "";

  return (
    <section aria-labelledby="summary-heading" className="pb-2" data-testid="summary-strip">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 id="summary-heading" className="text-xl font-semibold tracking-tight text-ink">Last week at a glance</h2>
        {/* One badge for the four tiles: they share one source and date. */}
        <FreshnessBadge asOf={meta.as_of} cadence={cadenceFor(meta)} />
      </div>
      <p className="mt-1 text-sm text-muted">
        {latestWeek ? <>Week of {formatWeek(latestWeek)}. </> : null}
        <Glossed text={BED_WAIT_SHORT} />
      </p>
      <ul className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile id="above">
          <KpiTile dense freshness={false} label="Hospitals above usual" value={above.length} unit={`of ${statuses.length}`} meta={meta}
                   detail={
                     <>
                       {above.length ? (
                         <Tip label={above.length === 1 ? "See which hospital" : "See which hospitals"} data={{ "data-testid": "above-list" }}>
                           {above.map((s) => (
                             <span key={s.code} className="block">{name(s.code)}: {formatDelta(s.pct)?.spoken} vs usual</span>
                           ))}
                         </Tip>
                       ) : (
                         <span>None is {HIGHER_PCT}% or more above its usual week.</span>
                       )}
                       {noComparison ? <span className="block" data-testid="above-unknown">{noComparison} with no comparison.</span> : null}
                     </>
                   } />
        </Tile>
        <Tile id="longest">
          <KpiTile dense freshness={false} label="Longest bed wait last week" value={longest?.latest ?? null} unit="h" format={hours} meta={meta}
                   detail={longest ? <>{name(longest.code)}.{uccNote}</> : "No hospital has a complete week of figures."} />
        </Tile>
        <Tile id="change">
          <KpiTile dense freshness={false} label="Largest change against usual" value={change?.pct ?? null} format={(v) => formatDelta(v)?.spoken ?? ""}
                   unit="vs usual" meta={meta}
                   detail={change ? <>{name(change.code)}. Usual is the {USUAL_WEEKS}-week median.</> : "No hospital has enough complete weeks to compare."} />
        </Tile>
        <Tile id="middle">
          <KpiTile dense freshness={false} label={<><Term id="median">Median</Term> bed wait across hospitals, last week</>} value={middleNow} unit="h" format={hours}
                   meta={meta}
                   detail={middleNow != null ? (
                     <span className="flex flex-wrap items-center gap-x-2">
                       <Sparkline values={middle} tone="none" />
                       <span>Last 12 weeks; middle of {fullEds} hospitals. Urgent care centre left out.</span>
                     </span>
                   ) : `Needs ${MIN_HOSPITALS}+ hospitals with a complete week. Urgent care centre left out.`} />
        </Tile>
      </ul>
    </section>
  );
}
