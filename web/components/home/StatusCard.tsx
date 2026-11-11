import Link from "next/link";

import { signed } from "@/components/edcharts/format";
import { Term } from "@/components/terms/Term";
import type { LiveReading } from "@/lib/api/types";
import { formatAsOf } from "@/lib/dates";
import { estimateText } from "@/lib/estimates";
import type { Density } from "@/lib/homeViews";
import { type HospitalStatus, LEVELS } from "@/lib/status";

import { Sparkline } from "./Sparkline";
import { StatusBadge } from "./StatusBadge";

const hrs = (v: number) => `${v.toFixed(1)} h`;

/**
 * One hospital: badge, last week's bed wait and one plain sentence. The full card adds the 12-week
 * line and the change against usual, as a percentage (the figure the badge is set from). It is cut
 * to a whole number towards zero, so it can't disagree with the badge: +14.6% is "+14%", about usual.
 * `note` says what the figures cover when it isn't a full adult and children's ED (lib/hospitalNotes.ts).
 */
export function StatusCard({ status, note, live, density = "full" }: {
  status: HospitalStatus; note: string | null; live: LiveReading | null; density?: Density }) {
  const info = LEVELS[status.level];
  const full = density === "full";
  return (
    <li className="flex flex-col rounded-xl border border-line bg-surface p-4 shadow-sm" data-testid="status-card"
        data-hospital={status.code} data-level={status.level} data-density={density}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold leading-snug text-ink">
          <Link href={`/ed-trends?hospital=${status.code}`} className="text-ink no-underline hover:underline">
            {/* A card's title always gives the full name: cards are read on their own, in any order. */}
            <Term id={status.code.toLowerCase()} plain standalone />
          </Link>
          {note ? <span className="block text-xs font-normal text-muted" data-testid="status-note">{note}</span> : null}
        </h3>
        <StatusBadge level={status.level} />
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <p>
          <span className="block text-3xl font-semibold tabular-nums tracking-tight text-ink" data-testid="status-hours">
            {status.latest == null ? "–" : hrs(status.latest)}
          </span>
          <span className="block text-xs text-muted">wait for a ward bed, last week</span>
          {full && status.pct != null ? (
            <span className="mt-1 block text-sm font-medium tabular-nums text-ink" data-testid="status-delta">
              {signed(Math.trunc(status.pct), 0)}% <span className="font-normal text-muted">against usual</span>
            </span>
          ) : null}
        </p>
        {full ? <Sparkline values={status.spark} tone={info.tone} /> : null}
      </div>
      <p className="mt-3 text-sm text-ink" data-testid="status-sentence">
        {status.latest == null ? "No complete week of figures last week." : info.sentence}
        {status.usual != null ? <span className="text-muted"> Usual: {hrs(status.usual)}.</span> : null}
      </p>
      {live ? (
        <p className="mt-2 border-t border-line pt-2 text-xs text-muted" data-testid="status-live">
          To see a doctor: {estimateText(live.est_wait_to_see_doctor_hours, live.est_wait_to_see_doctor_qualifier)}
          {" "}(hospital&apos;s own estimate, <time dateTime={live.snapshot_at}>{formatAsOf(live.snapshot_at, { withTime: true })}</time>)
        </p>
      ) : null}
    </li>
  );
}
