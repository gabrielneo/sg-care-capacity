import type { Metadata } from "next";
import Link from "next/link";

import { ChartCard } from "@/components/ChartCard";
import { KpiTile } from "@/components/KpiTile";
import { PageHeader } from "@/components/PageHeader";
import { CheckResults } from "@/components/quality/CheckResults";
import { CoverageGrid } from "@/components/quality/CoverageGrid";
import { FreshnessTable } from "@/components/quality/FreshnessTable";
import { ErrorState } from "@/components/States";
import { api, settle } from "@/lib/api/client";
import { CAVEAT, plainError } from "@/lib/copy";
import { COVERAGE_WINDOWS, coverageGrid, parseWindow, windowStart } from "@/lib/coverage";
import { Glossed } from "@/components/terms/Glossed";
import { Term } from "@/components/terms/Term";

export const metadata: Metadata = { title: "Data Quality" };
export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | string[] | undefined>>;

interface HospitalCoverage {
  hospital_name: string;
  first_day: string;
  expected_days: number;
  days_with_wait: number;
  days_with_attendances: number;
  missing_wait_days: number;
  missing_attendance_days: number;
}

const INTRO = (
  <>
    Every weekly data release passes these checks before it is published. Each check is explained, with its threshold and why, in{" "}
    <Link href="/docs/data-quality">the data-quality checks</Link>; how the gate works is in{" "}
    <Link href="/decisions/0002-validation-gate">decision record 0002</Link>.
  </>
);

export default async function DataQualityPage({ searchParams }: { searchParams: Search }) {
  const weeks = parseWindow((await searchParams).weeks);
  const base = await settle(Promise.all([api.quality(), api.meta(), api.hospitals()]));
  if (!base.ok) {
    return (
      <>
        <PageHeader title="Data quality" intro={INTRO} />
        <ErrorState error={plainError(base.error)} />
      </>
    );
  }
  const [quality, snapshot, hospitals] = base.value;
  const results = quality.data.results;
  const failed = (sev: string, blocking?: boolean) =>
    results.filter((r) => r.status === "fail" && r.severity === sev && (blocking === undefined || r.blocks_publish === blocking));
  const quarantined = failed("ERROR", false).reduce((n, r) => n + r.failing_rows, 0);

  const to = snapshot.meta.sources.find((s) => s.id === "moh_bed_waits")?.as_of?.slice(0, 10) ?? null;
  const from = to ? windowStart(to, weeks) : null;
  const daily = from && to ? await settle(api.edDaily({ from, to })) : null;
  const grid = daily?.ok && from && to ? coverageGrid(daily.value.data, hospitals.data, from, to) : null;
  const history = ((snapshot.meta.coverage ?? {}) as { hospitals?: Record<string, HospitalCoverage> }).hospitals ?? {};

  return (
    <>
      <PageHeader title="Data quality" intro={INTRO} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label="Checks run on this data release" value={results.length} meta={quality.meta} format={String} release />
        <KpiTile label="Failures that stop publishing" value={quality.data.blocking} meta={quality.meta} format={String} release
                 caveat="Always 0 in a published release" />
        <KpiTile label="Warnings raised" value={failed("WARN").length} meta={quality.meta} format={String} release />
        <KpiTile label="Records set aside" value={quarantined} meta={quality.meta} release format={(v) => v.toLocaleString("en-SG")}
                 caveat="Never corrected, never filled in" />
      </div>

      <div className="mt-6 space-y-6">
        <ChartCard title="Check results" meta={quality.meta} caveat={CAVEAT.quality} detail release
                   description={`The checks that published data release ${snapshot.data.snapshot_id}, grouped by what a failure does.`}>
          <CheckResults report={quality.data} />
        </ChartCard>

        <ChartCard title={<Glossed text="ED coverage: hospital × day" />} slug="ed-coverage" meta={daily?.ok ? daily.value.meta : snapshot.meta} caveat={null}
                   description={
                     <>
                       <Glossed text="Whether MOH published both figures (the bed wait and ED visits) for each hospital on each day." />{" "}
                       <span className="inline-flex flex-wrap gap-2 align-middle" aria-label="Window">
                         {COVERAGE_WINDOWS.map((w) => (
                           <Link key={w} href={w === 13 ? "/data-quality" : `/data-quality?weeks=${w}`} aria-current={w === weeks ? "page" : undefined}
                                 className={`rounded px-2 py-0.5 text-xs no-underline ${w === weeks ? "bg-accent-soft font-semibold text-accent-strong" : "text-accent hover:underline"}`}>
                             {w} weeks
                           </Link>
                         ))}
                       </span>
                     </>
                   }>
          {grid ? (
            <CoverageGrid days={grid.days} rows={grid.rows} />
          ) : (
            <ErrorState title="The coverage grid couldn't be loaded" error={daily && !daily.ok ? plainError(daily.error) : { message: "This week's data release has no date for the MOH figures." }} />
          )}
          {Object.keys(history).length ? (
            <>
              <h3 className="mt-6 text-sm font-semibold">Whole series</h3>
              <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Coverage over the whole series (scrolls sideways)">
                <table className="mt-1 w-full min-w-[560px] border-collapse text-sm" data-testid="coverage-history">
                  <thead>
                    <tr className="border-b border-line text-left">
                      <th scope="col" className="py-1.5 pr-3 font-semibold">Hospital</th>
                      <th scope="col" className="py-1.5 pr-3 font-semibold">Reported from</th>
                      <th scope="col" className="py-1.5 pr-3 text-right font-semibold">Days expected</th>
                      <th scope="col" className="py-1.5 pr-3 text-right font-semibold">Missing bed wait</th>
                      <th scope="col" className="py-1.5 text-right font-semibold">Missing <Glossed text="ED" plain /> visits</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(history).map(([code, c]) => (
                      <tr key={code} className="border-b border-line">
                        <th scope="row" className="py-1.5 pr-3 text-left font-normal"><Term id={code.toLowerCase()} /></th>
                        <td className="py-1.5 pr-3 tabular-nums">{c.first_day}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{c.expected_days.toLocaleString("en-SG")}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{c.missing_wait_days}</td>
                        <td className="py-1.5 text-right tabular-nums">{c.missing_attendance_days}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </ChartCard>

        <ChartCard title="Freshness by source" meta={snapshot.meta} caveat={null} release
                   description="How current each source is, judged against how often it is published. An old source is flagged, not hidden.">
          <FreshnessTable sources={snapshot.meta.sources} />
        </ChartCard>
      </div>
    </>
  );
}
