import type { Metadata } from "next";
import Link from "next/link";

import { ChartCard } from "@/components/ChartCard";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState, ErrorState } from "@/components/States";
import { api, settle } from "@/lib/api/client";
import type { LiveReading } from "@/lib/api/types";
import { formatAsOf } from "@/lib/dates";

export const metadata: Metadata = { title: "Live" };
export const dynamic = "force-dynamic";

const INTRO = "Waiting estimates that NUHS publishes for its emergency departments at Alexandra, National University and Ng Teng Fong hospitals.";

function hoursText(v: number | null): string {
  if (v == null) return "Not stated";
  const n = Number.isInteger(v) ? String(v) : v.toLocaleString("en-SG", { maximumFractionDigits: 1 });
  return `${n} ${v === 1 ? "hour" : "hours"}`;
}

function Reading({ r }: { r: LiveReading }) {
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 text-sm">
      <dt className="text-muted">Patients waiting to see a doctor</dt>
      <dd className="text-right text-lg font-semibold tabular-nums">{r.patients_waiting ?? "Not stated"}</dd>
      <dt className="text-muted">Estimated wait to see a doctor</dt>
      <dd className="text-right text-lg font-semibold tabular-nums">{hoursText(r.est_wait_to_see_doctor_hours)}</dd>
      <dt className="text-muted">Estimated wait for a ward bed</dt>
      <dd className="text-right text-lg font-semibold tabular-nums">{hoursText(r.est_bed_wait_hours)}</dd>
    </dl>
  );
}

export default async function LivePage() {
  const result = await settle(api.liveNuhsLatest());
  if (!result.ok) {
    return (
      <>
        <PageHeader title="Live: NUHS estimates" intro={INTRO} />
        <ErrorState error={result.error} />
      </>
    );
  }
  const { data, meta } = result.value;
  return (
    <>
      <PageHeader title="Live: NUHS estimates" intro={INTRO} />
      <div role="note" className="mb-6 max-w-prose rounded-lg border border-warn/40 bg-warn-soft p-4 text-sm text-warn">
        <p className="font-semibold">Estimates from the NUHS public page, not live and not MOH statistics</p>
        <p className="mt-1">
          They are read from the NUHS page when the weekly data snapshot is built, so each one can be up to 7 days old: check
          its time. They are NUHS&apos;s own estimates at one moment, not MOH&apos;s daily median of admitted patients, so compare
          them with <Link href="/ed-trends?hospital=NUH&hospital=NTFGH&hospital=AH">MOH&apos;s figures</Link> only side by side.
        </p>
      </div>
      {data.length === 0 ? (
        <EmptyState title="No NUHS readings in this snapshot" message="The NUHS page couldn't be read when this snapshot was built." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.map((r) => (
            <ChartCard key={`${r.site_name}|${r.department}`} title={`${r.site_name}: ${r.department}`} meta={meta} cadence="live"
                       caveat={r.is_adult_ed === false ? "Children's emergency: not part of MOH's NUH figures, which cover adults only." : null}
                       description={
                         <span data-testid="reading-label">
                           Estimate from NUHS public page, at{" "}
                           <time dateTime={r.snapshot_at}>{formatAsOf(r.snapshot_at, { withTime: true })}</time>
                         </span>
                       }>
              <Reading r={r} />
            </ChartCard>
          ))}
        </div>
      )}
    </>
  );
}
