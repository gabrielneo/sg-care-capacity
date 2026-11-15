import Link from "next/link";

import { CaveatChip } from "@/components/CaveatChip";
import { Term } from "@/components/terms/Term";
import type { Hospital, LiveReading } from "@/lib/api/types";
import { formatAsOf } from "@/lib/dates";
import { estimateShort, estimateText, NO_DOCTOR_ESTIMATE, nuhsTimingNote } from "@/lib/estimates";
import type { Density } from "@/lib/homeViews";
import { formatDelta } from "@/lib/planner";
import { formatWindow } from "@/lib/windows";
import { type HospitalStatus, LEVELS, trendPhrase, usualBand } from "@/lib/status";
import { HospitalName } from "@/components/HospitalName";

import { Sparkline } from "./Sparkline";
import { StatusBadge } from "./StatusBadge";
import { Missing } from "@/components/Missing";

const hrs = (v: number) => `${v.toFixed(1)} h`;

/**
 * One hospital. The whole card is a link to the hospital's trend page (the title is the link; it
 * is stretched over the card, so a screen reader hears the name once).
 * - Simple (Public): badge, last week's bed wait and one plain sentence.
 * - Full (Planner, Analyst): six reserved slots (name, badges and caveats, label, value with its 12-week line, change,
 *   footer), so cards line up in a grid (globals.css, ".sc"). Only a hospital above usual has a status-coloured left edge.
 *   The 12-week line has the usual range shaded; and the change against usual is a percentage (the
 *   figure the badge is set from), cut to a whole number towards zero so it can't disagree with the
 *   badge: +14.6% is "▲ 14%", about usual. No usual level: no percentage, never a 0%.
 * The footer is the NUHS doctor-wait estimate with its own time, or says there is none; what "published separately" means is
 * said once in the section's key (StatusGrid), not on every card. `wide` is the urgent care centre's full-width card.
 * `note` says what the figures cover when it isn't a full adult and children's ED (lib/hospitalNotes.ts).
 */
export function StatusCard({ status, hospital, note, live, weeklyAsOf, density = "full", wide = false }: {
  status: HospitalStatus; hospital?: Pick<Hospital, "hospital_code" | "hospital_name" | "short_name">; note: string | null;
  live: LiveReading | null; weeklyAsOf?: string | null; density?: Density; wide?: boolean }) {
  const info = LEVELS[status.level];
  const full = density === "full";
  const delta = full ? formatDelta(status.pct) : null;
  const title = (
    <Link href={`/ed-trends?hospital=${status.code}`}
          className="text-ink link-quiet after:absolute after:inset-0 after:rounded-xl">
      {/* Short name and code, with the full name as the title (audit G4); the glossary's full name without a reference. */}
      {hospital ? <HospitalName hospital={hospital} inControl quietCode={full} /> : <Term id={status.code.toLowerCase()} plain standalone />}
      {full ? <span className="sr-only">, {info.label}, {trendPhrase(status.spark)}</span> : null}
    </Link>
  );
  const shell = "target-card relative rounded-xl border border-line bg-surface hover:border-control "
    + "has-[a:focus-visible]:outline-3 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-accent";
  const attrs = { id: `hospital-${status.code}`, "data-testid": "status-card", "data-hospital": status.code, "data-level": status.level, "data-density": density };

  if (!full) {
    const liveLine = live ? (
      <p className="mt-2 border-t border-line pt-2 text-meta text-muted" data-testid="status-live">
        To see a doctor: {estimateText(live.est_wait_to_see_doctor_hours, live.est_wait_to_see_doctor_qualifier)}
        {" "}(<Term id="nuhs" /> estimate, <time dateTime={live.snapshot_at}>{formatAsOf(live.snapshot_at, { withTime: true })}</time>).
        {" "}<span data-testid="nuhs-timing">{nuhsTimingNote(live.snapshot_at, weeklyAsOf)}</span>
      </p>
    ) : (
      <p className="mt-2 border-t border-line pt-2 text-meta text-muted" data-testid="status-live-none">To see a doctor: {NO_DOCTOR_ESTIMATE}.</p>
    );
    return (
      <li className={`${shell} flex flex-col p-4`} {...attrs}>
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold leading-snug text-ink text-h3">
            {title}
            {note ? <span className="block text-meta font-normal text-muted" data-testid="status-note">{note}</span> : null}
          </h3>
          <StatusBadge level={status.level} />
        </div>
        <p className="mt-3">
          <span className="block text-kpi font-semibold tabular-nums tracking-tight text-ink" data-testid="status-hours">
            {status.latest == null ? <Missing /> : hrs(status.latest)}
          </span>
          <span className="block text-meta text-muted">bed wait, latest complete week</span>
        </p>
        <p className="mt-3 text-small text-ink" data-testid="status-sentence">
          {status.latest == null ? "No complete figures for the latest complete week." : info.sentence}
          {status.usual != null ? <span className="text-muted"> Usual: {hrs(status.usual)}.</span> : null}
        </p>
        {liveLine}
      </li>
    );
  }

  const edge = status.level === "higher" || status.level === "much_higher";
  const deltaTone = { much: "text-status-much", higher: "text-status-higher", usual: "text-status-usual", lower: "text-status-lower", none: "text-muted" }[info.tone];
  const edgeColour = status.level === "much_higher" ? "border-l-status-much" : "border-l-status-higher";
  const liveLine = live ? (
    <p className="sc-foot border-t border-line text-meta text-muted" data-testid="status-live">
      <span className="sc-short">Bed wait, {formatWindow({ kind: "latest_week" })}{" · "}{note ? <>{note}{" · "}</> : null}</span>To see a doctor: {estimateShort(live.est_wait_to_see_doctor_hours, live.est_wait_to_see_doctor_qualifier)}
      {" · "}<Term id="nuhs" plain /> estimate, <time dateTime={live.snapshot_at}>{formatAsOf(live.snapshot_at, { compact: true })}</time>
    </p>
  ) : (
    <p className="sc-foot border-t border-line text-meta text-tertiary" data-testid="status-live-none">
      <span className="sc-short">Bed wait, {formatWindow({ kind: "latest_week" })}{" · "}{note ? <>{note}{" · "}</> : null}</span>Doctor wait: no <Term id="nuhs" plain /> estimate
    </p>
  );
  return (
    <li className={`${shell} sc ${edge ? edgeColour : ""} ${wide ? "sc-wide" : ""}`} data-edge={edge ? "true" : "false"} {...attrs}>
      <h3 className="sc-name font-semibold leading-snug text-ink text-h3">{title}</h3>
      <div className="sc-chips">
        <span className="sc-badge"><StatusBadge level={status.level} /></span>
        {note ? <span className="sc-chip"><CaveatChip><span data-testid="status-note">{note}</span></CaveatChip></span> : null}
      </div>
      <p className="sc-label text-meta text-muted">Bed wait, {formatWindow({ kind: "latest_week" })}</p>
      <div className="sc-value">
        <p className="text-kpi font-semibold tabular-nums tracking-tight text-ink">
          <span data-testid="status-hours">{status.latest == null ? <Missing /> : <>{status.latest.toFixed(1)} <span className="text-small font-normal text-muted">h</span></>}</span>
        </p>
        <span className="sc-spark ml-auto"><Sparkline values={status.spark} tone={info.tone} band={usualBand(status.usual)} /></span>
      </div>
      {delta && status.usual != null ? (
        <p className="sc-delta text-small tabular-nums text-muted">
          <span data-testid="status-delta">
            <span className={`font-semibold ${deltaTone}`}><span aria-hidden="true">{delta.text}</span><span className="sr-only">{delta.spoken}</span></span> vs usual
          </span>
          {" · "}<span data-testid="status-usual">usual {hrs(status.usual)}</span>
        </p>
      ) : (
        <p className="sc-delta text-small text-muted" data-testid="status-sentence">
          {status.latest == null ? "No complete figures for the latest complete week." : "Too few weeks to compare."}
        </p>
      )}
      {liveLine}
    </li>
  );
}
