import { CaveatChip } from "@/components/CaveatChip";
import { Term } from "@/components/terms/Term";
import type { Hospital, LiveReading } from "@/lib/api/types";
import { BED_WAIT_LABEL } from "@/lib/copy";
import { formatAsOf } from "@/lib/dates";
import { estimateText } from "@/lib/estimates";
import { shortNote } from "@/lib/hospitalNotes";
import { type HospitalStatus, LEVELS } from "@/lib/status";

import { BedWaitHelp } from "./BedWaitHelp";
import { StatusBadge } from "./StatusBadge";

const hours = (v: number) => `${v.toFixed(1)} ${v === 1 ? "hour" : "hours"}`;

/**
 * One hospital for the public view, in plain words. Rendered on the server for every hospital; the
 * page's script picks the three nearest the search (components/home/EdNearby.tsx).
 * - The badge is the status scale's own level, in words ("Busier than usual for this hospital").
 * - The bed wait always carries the full label (Rule 4) and a "?" saying it isn't the time to see a doctor.
 * - "To see a doctor" appears only where NUHS publishes an estimate, labelled so, with its own time.
 */
export function EdNearbyCard({ status, hospital, live }: { status: HospitalStatus; hospital: Hospital; live: LiveReading | null }) {
  const note = shortNote(hospital);
  const info = LEVELS[status.level];
  return (
    <article className="h-full rounded-xl border border-line bg-surface p-4 shadow-sm" data-testid="ed-card"
             data-hospital={status.code} data-level={status.level}>
      <h3 className="text-lg font-semibold leading-snug text-ink"><Term id={status.code.toLowerCase()} plain standalone /></h3>
      {note ? <p className="mt-1"><CaveatChip large><span data-testid="ed-note">{note}</span></CaveatChip></p> : null}
      <p className="mt-3"><StatusBadge level={status.level} plain /></p>
      <div className="mt-3 flex items-start justify-between gap-2">
        <p className="text-base text-ink" data-testid="ed-label">{BED_WAIT_LABEL}</p>
        <BedWaitHelp />
      </div>
      <p>
        <span className="text-3xl font-semibold tabular-nums tracking-tight text-ink" data-testid="ed-hours">
          {status.latest == null ? "–" : hours(status.latest)}
        </span>
        <span className="block text-sm text-muted">Average of each day&apos;s median, last week</span>
      </p>
      <p className="mt-2 text-base text-ink" data-testid="ed-sentence">
        {status.latest == null ? "No complete week of figures last week." : info.sentence}
        {status.usual != null ? <span className="text-muted"> Usual: {hours(status.usual)}.</span> : null}
      </p>
      {live ? (
        <p className="mt-3 border-t border-line pt-3 text-base text-ink" data-testid="ed-live">
          To see a doctor (<Term id="nuhs" /> estimate): {estimateText(live.est_wait_to_see_doctor_hours, live.est_wait_to_see_doctor_qualifier)}
          <span className="block text-sm text-muted">
            As of <time dateTime={live.snapshot_at}>{formatAsOf(live.snapshot_at, { withTime: true })}</time>. An estimate, not live.
          </span>
        </p>
      ) : null}
    </article>
  );
}
