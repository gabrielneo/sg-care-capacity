import Link from "next/link";

import { CaveatChip } from "@/components/CaveatChip";
import { Term } from "@/components/terms/Term";
import type { Hospital, LiveReading } from "@/lib/api/types";
import { formatAsOf } from "@/lib/dates";
import { estimateText, NO_DOCTOR_ESTIMATE, nuhsTimingNote } from "@/lib/estimates";
import type { Density } from "@/lib/homeViews";
import { formatDelta } from "@/lib/planner";
import { type HospitalStatus, LEVELS, usualBand } from "@/lib/status";
import { HospitalName } from "@/components/HospitalName";

import { Sparkline } from "./Sparkline";
import { StatusBadge } from "./StatusBadge";

const hrs = (v: number) => `${v.toFixed(1)} h`;

/**
 * One hospital. The whole card is a link to the hospital's trend page (the title is the link; it
 * is stretched over the card, so a screen reader hears the name once).
 * - Simple (Public): badge, last week's bed wait and one plain sentence.
 * - Full (Planner, Analyst): a denser card. The badge is quiet unless the hospital is above usual;
 *   the 12-week line has the usual range shaded; and the change against usual is a percentage (the
 *   figure the badge is set from), cut to a whole number towards zero so it can't disagree with the
 *   badge: +14.6% is "▲ 14%", about usual. No usual level: no percentage, never a 0%.
 * `note` says what the figures cover when it isn't a full adult and children's ED (lib/hospitalNotes.ts).
 */
export function StatusCard({ status, hospital, note, live, weeklyAsOf, density = "full" }: {
  status: HospitalStatus; hospital?: Pick<Hospital, "hospital_code" | "hospital_name" | "short_name">; note: string | null;
  live: LiveReading | null; weeklyAsOf?: string | null; density?: Density }) {
  const info = LEVELS[status.level];
  const full = density === "full";
  const delta = full ? formatDelta(status.pct) : null;
  const title = (
    <Link href={`/ed-trends?hospital=${status.code}`}
          className="text-ink no-underline after:absolute after:inset-0 after:rounded-xl hover:underline">
      {/* Short name and code, with the full name as the title (audit G4); the glossary's full name without a reference. */}
      {hospital ? <HospitalName hospital={hospital} inControl /> : <Term id={status.code.toLowerCase()} plain standalone />}
    </Link>
  );
  const liveLine = live ? (
    <p className={`${full ? "mt-2 pt-2" : "mt-2 pt-2"} border-t border-line text-xs text-muted`} data-testid="status-live">
      To see a doctor: {estimateText(live.est_wait_to_see_doctor_hours, live.est_wait_to_see_doctor_qualifier)}
      {" "}(<Term id="nuhs" /> estimate, <time dateTime={live.snapshot_at}>{formatAsOf(live.snapshot_at, { withTime: true })}</time>).
      {" "}<span data-testid="nuhs-timing">{nuhsTimingNote(live.snapshot_at, weeklyAsOf)}</span>
    </p>
  ) : (
    <p className="mt-2 border-t border-line pt-2 text-xs text-muted" data-testid="status-live-none">To see a doctor: {NO_DOCTOR_ESTIMATE}.</p>
  );
  const shell = "relative flex flex-col rounded-xl border border-line bg-surface hover:border-accent "
    + "has-[a:focus-visible]:outline-3 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-accent";
  const attrs = { "data-testid": "status-card", "data-hospital": status.code, "data-level": status.level, "data-density": density };

  if (!full) {
    return (
      <li className={`${shell} p-4`} {...attrs}>
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold leading-snug text-ink">
            {title}
            {note ? <span className="block text-xs font-normal text-muted" data-testid="status-note">{note}</span> : null}
          </h3>
          <StatusBadge level={status.level} />
        </div>
        <p className="mt-3">
          <span className="block text-3xl font-semibold tabular-nums tracking-tight text-ink" data-testid="status-hours">
            {status.latest == null ? "–" : hrs(status.latest)}
          </span>
          <span className="block text-xs text-muted">wait for a ward bed, latest complete week</span>
        </p>
        <p className="mt-3 text-sm text-ink" data-testid="status-sentence">
          {status.latest == null ? "No complete figures for the latest complete week." : info.sentence}
          {status.usual != null ? <span className="text-muted"> Usual: {hrs(status.usual)}.</span> : null}
        </p>
        {liveLine}
      </li>
    );
  }

  return (
    <li className={`${shell} p-3`} {...attrs}>
      <h3 className="text-sm font-semibold leading-snug text-ink">{title}</h3>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <StatusBadge level={status.level} quiet />
        {note ? <CaveatChip><span data-testid="status-note">{note}</span></CaveatChip> : null}
      </div>
      <p className="mt-2 text-xs text-muted">Wait for a ward bed, latest complete week</p>
      <div className="flex items-end justify-between gap-2">
        <p className="text-3xl font-semibold tabular-nums tracking-tight text-ink" data-testid="status-hours">
          {status.latest == null ? "–" : hrs(status.latest)}
        </p>
        <Sparkline values={status.spark} tone={info.tone} band={usualBand(status.usual)} />
      </div>
      {delta && status.usual != null ? (
        <p className="mt-1.5 text-sm tabular-nums text-muted">
          <span className="font-medium text-ink" data-testid="status-delta">
            <span aria-hidden="true">{delta.text}</span><span className="sr-only">{delta.spoken}</span> vs usual
          </span>
          {" · "}<span data-testid="status-usual">usual {hrs(status.usual)}</span>
        </p>
      ) : (
        <p className="mt-1.5 text-sm text-muted" data-testid="status-sentence">
          {status.latest == null ? "No complete figures for the latest complete week." : "Too few weeks to compare."}
        </p>
      )}
      {liveLine}
    </li>
  );
}
