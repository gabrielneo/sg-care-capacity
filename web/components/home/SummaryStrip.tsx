import type { ReactNode } from "react";

import { FreshnessBadge } from "@/components/FreshnessBadge";
import { KpiTile } from "@/components/KpiTile";
import { Glossed } from "@/components/terms/Glossed";
import { Term } from "@/components/terms/Term";
import { Tip } from "@/components/terms/TermView";
import type { Hospital, Meta } from "@/lib/api/types";
import { BED_WAIT_SHORT } from "@/lib/copy";
import { USUAL_WEEKS } from "@/lib/edCompare";
import { splitByCare, URGENT_CARE_HEADING, URGENT_CARE_NOTE } from "@/lib/hospitals";
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
 * - All four are across hospitals, so the urgent care centre is left out of each (lib/hospitals.ts,
 *   ADR 0012); one line under the tiles says so, instead of a note on each tile.
 */
export function SummaryStrip({ statuses, hospitals, meta, latestWeek }: {
  statuses: HospitalStatus[]; hospitals: Hospital[]; meta: Meta; latestWeek: WeekRange | null }) {
  if (!statuses.length) return null;
  const { rankable, urgentCare } = splitByCare(statuses, (s) => s.code, hospitals);
  const above = aboveUsual(statuses, hospitals);
  const noComparison = levelCounts(rankable).unknown;
  const longest = longestWait(statuses, hospitals);
  const change = largestChange(statuses, hospitals);
  const middle = acrossHospitals(statuses, hospitals);
  const middleNow = middle.at(-1) ?? null;
  const fullEds = rankable.filter((s) => s.latest != null).length;

  return (
    <section aria-labelledby="summary-heading" className="pb-2" data-testid="summary-strip">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 id="summary-heading" className="text-xl font-semibold tracking-tight text-ink">Last week at a glance</h2>
        {/* One badge for the four tiles: they share one source and date. */}
        <FreshnessBadge meta={meta} />
      </div>
      <p className="mt-1 text-sm text-muted">
        {latestWeek ? <>Week of {formatWeek(latestWeek)}. </> : null}
        <Glossed text={BED_WAIT_SHORT} />
      </p>
      <ul className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile id="above">
          <KpiTile dense freshness={false} label="Emergency departments above usual" value={above.length} unit={`of ${rankable.length}`} meta={meta}
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
                   detail={longest ? <>{name(longest.code)}.</> : "No emergency department has a complete week of figures."} />
        </Tile>
        <Tile id="change">
          <KpiTile dense freshness={false} label="Largest change against usual" value={change?.pct ?? null} format={(v) => formatDelta(v)?.spoken ?? ""}
                   unit="vs usual" meta={meta}
                   detail={change ? <>{name(change.code)}. Usual is the {USUAL_WEEKS}-week median.</> : "No emergency department has enough complete weeks to compare."} />
        </Tile>
        <Tile id="middle">
          <KpiTile dense freshness={false} label={<><Term id="median">Median</Term> bed wait across emergency departments, last week</>} value={middleNow} unit="h" format={hours}
                   meta={meta}
                   detail={middleNow != null ? (
                     <span className="flex flex-wrap items-center gap-x-2">
                       <Sparkline values={middle} tone="none" />
                       <span>Last 12 weeks; middle of {fullEds} emergency departments.</span>
                     </span>
                   ) : `Needs ${MIN_HOSPITALS}+ emergency departments with a complete week.`} />
        </Tile>
      </ul>
      {urgentCare.length ? (
        <p className="mt-2 text-xs text-muted" data-testid="summary-ucc-note">
          The {URGENT_CARE_HEADING.toLowerCase()} is left out of these four figures. {URGENT_CARE_NOTE}.
        </p>
      ) : null}
    </section>
  );
}
