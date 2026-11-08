import Link from "next/link";

import { Term } from "@/components/terms/Term";
import type { LiveReading } from "@/lib/api/types";
import { formatAsOf } from "@/lib/dates";
import { estimateText } from "@/lib/estimates";
import { type HospitalStatus, LEVELS } from "@/lib/status";

import { Sparkline } from "./Sparkline";

const BADGE = {
  bad: "border-bad/30 bg-bad-soft text-bad",
  warn: "border-warn/30 bg-warn-soft text-warn",
  ok: "border-ok/30 bg-ok-soft text-ok",
  none: "border-line bg-page text-muted",
} as const;

const hrs = (v: number) => `${v.toFixed(1)} h`;

/** One hospital: badge, last week's bed wait, 12-week line and one plain sentence. */
export function StatusCard({ status, isUcc, live }: { status: HospitalStatus; isUcc: boolean; live: LiveReading | null }) {
  const info = LEVELS[status.level];
  return (
    <li className="flex flex-col rounded-xl border border-line bg-surface p-4 shadow-sm" data-testid="status-card"
        data-hospital={status.code} data-level={status.level}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold leading-snug text-ink">
          <Link href={`/ed-trends?hospital=${status.code}`} className="text-ink no-underline hover:underline">
            <Term id={status.code.toLowerCase()} plain />
          </Link>
          {isUcc ? <span className="block text-xs font-normal text-muted">Urgent care centre</span> : null}
        </h3>
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${BADGE[info.tone]}`}
              data-testid="status-badge">
          <span aria-hidden="true">{info.icon}</span>
          {info.label}
        </span>
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <p>
          <span className="block text-3xl font-semibold tabular-nums tracking-tight text-ink" data-testid="status-hours">
            {status.latest == null ? "–" : hrs(status.latest)}
          </span>
          <span className="block text-xs text-muted">wait for a ward bed, last week</span>
        </p>
        <Sparkline values={status.spark} tone={info.tone} />
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
