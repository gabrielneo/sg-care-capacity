import type { ReactNode } from "react";

import { Prose } from "@/components/Prose";
import { SectionHeader } from "@/components/SectionHeader";
import { KpiTile } from "@/components/KpiTile";
import { Glossed } from "@/components/terms/Glossed";
import { Term } from "@/components/terms/Term";
import { Tip } from "@/components/terms/TermView";
import type { Hospital, Meta } from "@/lib/api/types";
import { sectionAnchor } from "@/lib/homeViews";
import { aboveUsualLede } from "@/lib/ledes";
import { shortNote } from "@/lib/hospitalNotes";
import { fullName, splitByCare, URGENT_CARE_HEADING, URGENT_CARE_NOTE } from "@/lib/hospitals";
import { aboveUsual, acrossHospitals, formatDelta, largestChange, longestWait, MIN_HOSPITALS } from "@/lib/planner";
import { HIGHER_PCT, type HospitalStatus, levelCounts, MUCH_HIGHER_PCT } from "@/lib/status";
import type { WeekRange } from "@/lib/weeks";

import { formatWindow, USUAL_WEEKS } from "@/lib/windows";
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
 * the cards below are drawn from (lib/planner.ts) and says nothing of its own date or source: the header's one line covers all four (lib/sectionMeta.ts).
 * - Every tile is a link to the hospital card it is about (the section, when it is about all of them); the card is highlighted by :target.
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

  const hospitalsHref = `#${sectionAnchor("hospitals")}`;
  const cardHref = (code: string | undefined) => (code ? `#hospital-${code}` : hospitalsHref);

  return (
    <section aria-labelledby="summary-heading" className="pb-2" data-testid="summary-strip">
      <SectionHeader id="summary-heading" title="How did bed waits compare with usual in the latest complete week?" meta={meta}
                     window={formatWindow({ kind: "latest_week", week: latestWeek }, { capital: true })}
                     lede={aboveUsualLede(above.map((s) => (() => { const h = hospitals.find((x) => x.hospital_code === s.code); return h ? fullName(h) : s.code; })()), rankable.length - noComparison)} ledeTestId="summary-lede"
                     measure={<>
                       <span className="block">Usual is the median of a hospital&apos;s previous {USUAL_WEEKS} complete weeks.</span>
                       <span className="mt-1 block">Above usual means the badge is higher ({HIGHER_PCT}% or more above usual) or much higher ({MUCH_HIGHER_PCT}% or more).</span>
                       <span className="mt-1 block">The typical bed wait is the median of the full emergency departments&apos; weekly averages.</span>
                       <span className="mt-1 block">The urgent care centre is in none of the four.</span>
                     </>} />
      <ul className="card-grid sm:grid-cols-2 lg:grid-cols-4">
        <Tile id="above">
          <KpiTile dense provenance={false} href={hospitalsHref} hrefHint="Show the hospital cards" label="Emergency departments above usual" value={above.length} unit={`of ${rankable.length}`} meta={meta}
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
          <KpiTile dense provenance={false} href={cardHref(longest?.code)} hrefHint="Show its hospital card" label="Longest bed wait" value={longest?.latest ?? null} unit="h" format={hours} meta={meta}
                   detail={longest ? <>{name(longest.code)}{longestAdultsOnly ? <span className="block">Adult emergency department only.</span> : null}</> : "No emergency department has a complete week of figures."} />
        </Tile>
        <Tile id="change">
          {/* The name is a label, not a sentence: no full stop, which could wrap onto a line of its own after the name's tooltip (review N11).
              "the 8-week usual" names the window in two lines; "vs usual (previous 8 complete weeks)" took three at four columns. */}
          <KpiTile dense provenance={false} href={cardHref(change?.code)} hrefHint="Show its hospital card" label={<>Biggest change vs the <span className="whitespace-nowrap">{USUAL_WEEKS}-week usual</span></>} value={change?.pct ?? null} format={(v) => formatDelta(v)?.spoken ?? ""}
                   meta={meta}
                   detail={change ? name(change.code) : "No emergency department has enough complete weeks to compare."} />
        </Tile>
        <Tile id="middle">
          <KpiTile dense provenance={false} href={hospitalsHref} hrefHint="Show the hospital cards" label="Typical bed wait across emergency departments" value={middleNow} unit="h" format={hours}
                   meta={meta}
                   detail={middleNow != null ? <><Term id="median">Median</Term> of {fullEds} emergency departments.</> : `Needs ${MIN_HOSPITALS}+ emergency departments with a complete week.`} />
        </Tile>
      </ul>
      {adultsOnly.length ? (
        <Prose size="meta" tone="muted" className="mt-3" data-testid="summary-adults-note">
          {adultsOnly.map((h, i) => <span key={h.hospital_code}>{i > 0 ? ", " : null}{name(h.hospital_code)}</span>)}
          {" "}<Glossed text={`covers ${adultsOnly.length === 1 ? "its" : "their"} adult emergency ${adultsOnly.length === 1 ? "department" : "departments"} only: children's emergency is not in MOH's figures.`} />
        </Prose>
      ) : null}
      {urgentCare.length ? (
        <Prose size="meta" tone="muted" className="mt-2" data-testid="summary-ucc-note">
          The {URGENT_CARE_HEADING.toLowerCase()} is left out of these four figures. {URGENT_CARE_NOTE}.
        </Prose>
      ) : null}
    </section>
  );
}
