import type { Metadata } from "next";
import Link from "next/link";

import { ChartCard } from "@/components/ChartCard";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState, ErrorState } from "@/components/States";
import { api, settle } from "@/lib/api/client";
import type { LiveReading } from "@/lib/api/types";
import { CAVEAT, plainError } from "@/lib/copy";
import { formatAsOf } from "@/lib/dates";
import { estimateCell } from "@/lib/estimates";
import { Glossed } from "@/components/terms/Glossed";

export const metadata: Metadata = { title: "Live" };
export const dynamic = "force-dynamic";

const INTRO = <Glossed text="Waiting estimates that NUHS publishes for its emergency departments at Alexandra, National University and Ng Teng Fong hospitals." />;
const TITLE = <Glossed text="Live: NUHS estimates" />;


function Reading({ r }: { r: LiveReading }) {
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 text-sm">
      <dt className="text-muted">Patients waiting to see a doctor</dt>
      <dd className="text-right text-lg font-semibold tabular-nums">{r.patients_waiting ?? "Not stated"}</dd>
      <dt className="text-muted">Estimated wait to see a doctor</dt>
      <dd className="text-right text-lg font-semibold tabular-nums">{estimateCell(r.est_wait_to_see_doctor_hours, r.est_wait_to_see_doctor_qualifier)}</dd>
      <dt className="text-muted"><Glossed text="Estimated wait for a ward bed (NUHS estimate)" /></dt>
      <dd className="text-right text-lg font-semibold tabular-nums">{estimateCell(r.est_bed_wait_hours, r.est_bed_wait_qualifier)}</dd>
    </dl>
  );
}

export default async function LivePage() {
  const result = await settle(api.liveNuhsLatest());
  if (!result.ok) {
    return (
      <>
        <PageHeader title={TITLE} intro={INTRO} />
        <ErrorState error={plainError(result.error)} />
      </>
    );
  }
  const { data, meta } = result.value;
  return (
    <>
      <PageHeader title={TITLE} intro={INTRO} />
      <div role="note" className="mb-6 max-w-prose rounded-lg border border-warn/40 bg-warn-soft p-4 text-sm text-warn">
        <p className="font-semibold"><Glossed text="Estimates from the NUHS public page, not live and not MOH statistics" /></p>
        <p className="mt-1">
          <Glossed text="They are read from the NUHS page when each weekly data release is built, so each one can be up to 7 days old: check its time." />{" "}
          <Glossed text="They are NUHS's own estimates at one moment, not MOH's daily median time waiting for a ward bed." /> Compare them
          with <Link href="/ed-trends?hospital=NUH&hospital=NTFGH&hospital=AH"><Glossed text="MOH's figures" plain /></Link> only side by side.
        </p>
      </div>
      {data.length === 0 ? (
        <EmptyState title={<Glossed text="No NUHS readings in this week's data release" />}
                    message={<Glossed text="The NUHS page couldn't be read when this week's data release was built." />} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.map((r) => (
            <ChartCard key={`${r.site_name}|${r.department}`} title={`${r.site_name}: ${r.department}`} meta={meta} cadence="live"
                       caveat={r.is_adult_ed === false ? CAVEAT.childrensEmergency : CAVEAT.live}
                       description={
                         <span data-testid="reading-label">
                           <Glossed text="Estimate from NUHS public page, at" />{" "}
                           <time dateTime={r.snapshot_at}><Glossed text={formatAsOf(r.snapshot_at, { withTime: true })} /></time>
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
