import Link from "next/link";

import { CaveatChip } from "@/components/CaveatChip";
import { Provenance } from "@/components/Provenance";
import { Glossed } from "@/components/terms/Glossed";
import { Term } from "@/components/terms/Term";
import type { Hospital, LiveReading, Meta } from "@/lib/api/types";
import { BED_WAIT_LABEL } from "@/lib/copy";
import { formatAsOf } from "@/lib/dates";
import { estimateText } from "@/lib/estimates";
import { shortNote } from "@/lib/hospitalNotes";
import { formatDelta } from "@/lib/planner";
import { type HospitalStatus, LEVELS, SPARK_WEEKS, usualBand } from "@/lib/status";

import { Sparkline } from "./Sparkline";
import { StatusBadge } from "./StatusBadge";

const hours = (v: number) => `${v.toFixed(1)} h`;

/** The line in words: the range of its complete weeks and how many there are. Only what the line already draws. */
export function sparkSummary(values: (number | null)[]): string {
  const known = values.filter((v): v is number => v != null);
  if (!known.length) return `No complete week in the last ${SPARK_WEEKS}.`;
  const lo = Math.min(...known);
  const hi = Math.max(...known);
  const range = lo === hi ? hours(lo) : `${hours(lo)} to ${hours(hi)}`;
  return `${known.length} of the last ${SPARK_WEEKS} weeks are complete, from ${range}.`;
}

/**
 * What the map's details drawer shows for one hospital. Rendered on the server for every hospital
 * (the drawer itself is the client part) from the same status the cards use: the same badge, the
 * same usual level, the same 12-week line. Nothing is computed here.
 * - The bed wait always carries its full label, never "wait time" alone.
 * - "To see a doctor" appears only where NUHS publishes an estimate, labelled so, with its own time.
 * - Coverage caveats come from dim_hospital (facility type, coverage and exclusions notes).
 */
export function HospitalDrawerBody({ status, hospital, live, meta, latestWeek }: {
  status: HospitalStatus; hospital: Hospital; live: LiveReading | null; meta: Meta; latestWeek: string | null }) {
  const info = LEVELS[status.level];
  const delta = formatDelta(status.pct);
  const note = shortNote(hospital);
  return (
    <div className="space-y-4" data-testid="drawer-body" data-hospital={status.code} data-level={status.level}>
      <p className="text-sm text-muted" data-testid="drawer-cluster">{hospital.cluster}</p>
      <p><StatusBadge level={status.level} plain /></p>

      <section aria-labelledby={`drawer-wait-${status.code}`}>
        <h3 id={`drawer-wait-${status.code}`} className="text-sm font-semibold text-ink">{BED_WAIT_LABEL}</h3>
        <p className="mt-1">
          <span className="text-3xl font-semibold tabular-nums tracking-tight text-ink" data-testid="drawer-hours">
            {status.latest == null ? "–" : hours(status.latest)}
          </span>
          <span className="block text-sm text-muted">
            Average of each day&apos;s median{latestWeek ? ", last week" : ""}
          </span>
        </p>
        <p className="mt-2 text-sm text-ink" data-testid="drawer-sentence">
          {status.latest == null ? "No complete week of figures last week." : info.sentence}
        </p>
        {status.usual != null ? (
          <p className="mt-1 text-sm tabular-nums text-muted" data-testid="drawer-usual">
            Usual: {hours(status.usual)}
            {delta ? (
              <> · <span className="font-medium text-ink" data-testid="drawer-delta">
                <span aria-hidden="true">{delta.text}</span><span className="sr-only">{delta.spoken}</span> vs usual
              </span></>
            ) : null}
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted" data-testid="drawer-usual">No usual level: fewer than 8 complete weeks to compare with.</p>
        )}
      </section>

      <section aria-labelledby={`drawer-line-${status.code}`}>
        <h3 id={`drawer-line-${status.code}`} className="text-sm font-semibold text-ink">Last {SPARK_WEEKS} weeks</h3>
        <div className="mt-1"><Sparkline values={status.spark} tone={info.tone} band={usualBand(status.usual)} /></div>
        <p className="mt-1 text-sm text-ink tabular-nums" data-testid="drawer-spark-summary">{sparkSummary(status.spark)}</p>
        <p className="mt-1 text-xs text-muted">
          Weekly average of daily medians. The shaded band is the &quot;about usual&quot; range; a week that isn&apos;t complete is a gap.
        </p>
      </section>

      {live ? (
        <p className="border-t border-line pt-3 text-sm text-ink" data-testid="drawer-live">
          To see a doctor (<Term id="nuhs" /> estimate): {estimateText(live.est_wait_to_see_doctor_hours, live.est_wait_to_see_doctor_qualifier)}
          <span className="block text-xs text-muted">
            As of <time dateTime={live.snapshot_at}>{formatAsOf(live.snapshot_at, { withTime: true })}</time>. An estimate, not live, and not the bed wait above.
          </span>
        </p>
      ) : null}

      {note || hospital.coverage_note || hospital.exclusions_note ? (
        <section aria-labelledby={`drawer-cover-${status.code}`} className="border-t border-line pt-3" data-testid="drawer-coverage">
          <h3 id={`drawer-cover-${status.code}`} className="text-sm font-semibold text-ink">What these figures cover</h3>
          {note ? <p className="mt-1"><CaveatChip large>{note}</CaveatChip></p> : null}
          {hospital.coverage_note ? <p className="mt-1 text-sm text-ink"><Glossed text={hospital.coverage_note} /></p> : null}
          {hospital.exclusions_note ? <p className="mt-1 text-sm text-muted"><Glossed text={hospital.exclusions_note} /></p> : null}
        </section>
      ) : null}

      <p><Link href={`/ed-trends?hospital=${status.code}`} className="inline-flex min-h-11 items-center" data-testid="drawer-trend">
        See {hospital.hospital_code}&apos;s trend over time</Link></p>
      <Provenance meta={meta} compact large />
    </div>
  );
}
