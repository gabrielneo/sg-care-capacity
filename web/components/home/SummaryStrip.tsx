import type { ReactNode } from "react";

import { Provenance } from "@/components/Provenance";
import { FreshnessBadge } from "@/components/FreshnessBadge";
import { KpiTile } from "@/components/KpiTile";
import { Glossed } from "@/components/terms/Glossed";
import { Term } from "@/components/terms/Term";
import { Tip } from "@/components/terms/TermView";
import type { Hospital, Meta } from "@/lib/api/types";
import { BED_WAIT_SHORT } from "@/lib/copy";
import { shortNote } from "@/lib/hospitalNotes";
import { splitByCare, URGENT_CARE_HEADING, URGENT_CARE_NOTE } from "@/lib/hospitals";
import { aboveUsual, acrossHospitals, formatDelta, largestChange, longestWait, MIN_HOSPITALS } from "@/lib/planner";
import { HIGHER_PCT, type HospitalStatus, levelCounts, SPARK_WEEKS } from "@/lib/status";
import type { WeekRange } from "@/lib/weeks";

import { Sparkline } from "./Sparkline";
import { formatWindow } from "@/lib/windows";
import { HospitalName } from "@/components/HospitalName";

const hours = (v: number) => v.toFixed(1);
/** "Singapore General (SGH)" (audit G4); inside a tooltip, with its full name as a title (no tooltip in a tooltip). */
function hospitalName(hospitals: Hospital[], code: string, inControl = false) {
  const h = hospitals.find((x) => x.hospital_code === code);
  return h ? <HospitalName hospital={h} inControl={inControl} /> : <Term id={code.toLowerCase()} plain standalone />;
}

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
  const name = (code: string) => hospitalName(hospitals, code);
  const listName = (code: string) => hospitalName(hospitals, code, true);
  const above = aboveUsual(statuses, hospitals);
  const noComparison = levelCounts(rankable).unknown;
  const longest = longestWait(statuses, hospitals);
  const change = largestChange(statuses, hospitals);
  const middle = acrossHospitals(statuses, hospitals);
  const middleNow = middle.at(-1) ?? null;
  // Sites whose figures cover adults only (NUH): said under the tiles, and on the tile when one is the longest wait (audit M6).
  const adultsOnly = rankable.flatMap((s) => {
    const h = hospitals.find((x) => x.hospital_code === s.code);
    return h && shortNote(h) === "Adults only" ? [h] : [];
  });
  const longestAdultsOnly = longest ? adultsOnly.some((h) => h.hospital_code === longest.code) : false;
  const fullEds = rankable.filter((s) => s.latest != null).length;

  return (
    <section aria-labelledby="summary-heading" className="pb-2" data-testid="summary-strip">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 id="summary-heading" className="font-semibold text-ink text-h2">
          At a glance: {formatWindow({ kind: "latest_week", week: latestWeek })}
        </h2>
        {/* One badge for the four tiles: they share one source and date. */}
        <FreshnessBadge meta={meta} />
      </div>
      <p className="mt-1 text-small text-muted">
        <Glossed text={BED_WAIT_SHORT} />
      </p>
      <ul className="mt-2 card-grid sm:grid-cols-2 lg:grid-cols-4">
        <Tile id="above">
          <KpiTile dense provenance={false} label="Emergency departments above usual, latest complete week" value={above.length} unit={`of ${rankable.length}`} meta={meta}
                   detail={
                     <>
                       {above.length ? (
                         <Tip label={above.length === 1 ? "See which hospital" : "See which hospitals"} data={{ "data-testid": "above-list" }}>
                           {above.map((s) => (
                             <span key={s.code} className="block">{listName(s.code)}: {formatDelta(s.pct)?.spoken} vs usual</span>
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
          <KpiTile dense provenance={false} label="Longest bed wait, latest complete week" value={longest?.latest ?? null} unit="h" format={hours} meta={meta}
                   detail={longest ? <>{name(longest.code)}.{longestAdultsOnly ? " Adult emergency department only." : ""}</> : "No emergency department has a complete week of figures."} />
        </Tile>
        <Tile id="change">
          <KpiTile dense provenance={false} label={`Largest change ${formatWindow({ kind: "usual" })}`} value={change?.pct ?? null} format={(v) => formatDelta(v)?.spoken ?? ""}
                   unit="vs usual" meta={meta}
                   detail={change ? <>{name(change.code)}. Usual is the median of those weeks.</> : "No emergency department has enough complete weeks to compare."} />
        </Tile>
        <Tile id="middle">
          <KpiTile dense provenance={false} label={<><Term id="median">Median</Term> bed wait across emergency departments, latest complete week</>} value={middleNow} unit="h" format={hours}
                   meta={meta}
                   detail={middleNow != null ? (
                     <span className="flex flex-wrap items-center gap-x-2">
                       <Sparkline values={middle} tone="none" />
                       <span>{formatWindow({ kind: "weeks", n: SPARK_WEEKS }, { capital: true })}; middle of {fullEds} emergency departments.</span>
                     </span>
                   ) : `Needs ${MIN_HOSPITALS}+ emergency departments with a complete week.`} />
        </Tile>
      </ul>
      {/* The date and source, once, for all four tiles. */}
      <Provenance meta={meta} compact freshness={false} tight />
      {adultsOnly.length ? (
        <p className="mt-1 text-meta text-muted" data-testid="summary-adults-note">
          {adultsOnly.map((h, i) => <span key={h.hospital_code}>{i > 0 ? ", " : null}{name(h.hospital_code)}</span>)}
          {" "}<Glossed text={`covers ${adultsOnly.length === 1 ? "its" : "their"} adult emergency ${adultsOnly.length === 1 ? "department" : "departments"} only: children's emergency is not in MOH's figures.`} />
        </p>
      ) : null}
      {urgentCare.length ? (
        <p className="mt-2 text-meta text-muted" data-testid="summary-ucc-note">
          The {URGENT_CARE_HEADING.toLowerCase()} is left out of these four figures. {URGENT_CARE_NOTE}.
        </p>
      ) : null}
    </section>
  );
}
