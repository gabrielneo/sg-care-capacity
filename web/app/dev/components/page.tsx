import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { type ReactNode, Suspense } from "react";

import { CaveatChip } from "@/components/CaveatChip";
import { ChartFrame } from "@/components/ChartFrame";
import { FreshnessBadge } from "@/components/FreshnessBadge";
import { StatusBadge } from "@/components/home/StatusBadge";
import { KpiTile } from "@/components/KpiTile";
import { PageHeader } from "@/components/PageHeader";
import { ChartFrameSkeleton, EmptyState, ErrorState, Skeleton } from "@/components/States";
import { AnnotatedChart, fromInsightChart } from "@/components/story/AnnotatedChart";
import { ViewSwitch } from "@/components/ViewSwitch";
import { DeltaNumber, deltaFromDisplay } from "@/components/story/DeltaNumber";
import { HighlightPhrase } from "@/components/story/HighlightPhrase";
import { api, settle } from "@/lib/api/client";
import { devPagesEnabled } from "@/lib/devPages";
import { datasetFreshness } from "@/lib/freshness";
import { colors, mapScale } from "@/lib/palette";
import { clinicMeta, edMeta, insightMeta, storySample } from "@/lib/samples";
import { LEVEL_ORDER } from "@/lib/status";
import { chartFormat, chartTitle } from "@/lib/story";

export const metadata: Metadata = { title: "Components", robots: { index: false, follow: false } };
// Rendered per request: the SHOW_DEV_PAGES switch is read at run time, and the live section calls
// the API when the page is viewed, not when the site is built.
export const dynamic = "force-dynamic";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 border-b border-line pb-1 font-semibold text-h2">{title}</h2>
      {children}
    </section>
  );
}

const SAMPLE_NOW = new Date("2026-11-06T12:00:00+08:00");

/** Calls the real API through the typed client, so this page also proves the wiring. */
async function LiveSnapshot() {
  const result = await settle(Promise.all([api.meta(), api.edSummary()]));
  if (!result.ok) {
    return (
      <ErrorState
        title="The API isn't reachable from the site"
        error={{ code: result.error.code, message: result.error.message }}
        action={
          <p className="text-small">
            Start the API (<code>LOCAL_SNAPSHOT_PATH=data/build/publish uvicorn --factory sg_health_api.main:create_app</code>) and
            set <code>API_BASE_URL</code> in <code>web/.env.local</code>.
          </p>
        }
      />
    );
  }
  const [snapshot, summary] = result.value;
  const sgh = summary.data.find((h) => h.hospital_code === "SGH");
  const wait = sgh?.mean_of_daily_median_wait_hours;
  return (
    <div className="card-grid sm:grid-cols-2">
      <KpiTile label="Days of ED data in this snapshot" value={snapshot.data.row_counts.fct_ed_daily ?? null}
               unit="hospital-days" meta={snapshot.meta} format={(v) => v.toLocaleString("en-SG")} />
      <KpiTile
        label={`SGH: average of daily median bed waits, week of ${sgh?.latest_complete_week?.week_start ?? "n/a"}`}
        value={wait?.latest ?? null}
        unit="hours"
        meta={summary.meta}
        change={{ value: wait?.change_pct ?? null, unit: "%", label: "vs the median of the previous 8 weeks" }}
      />
    </div>
  );
}

export default function ComponentsPage() {
  if (!devPagesEnabled()) notFound();
  return (
    <>
      <PageHeader
        title="Components"
        intro="Every reusable component, with sample data shaped like the real API responses. Not linked from the site."
      />

      <Section title="Live: typed client against the API">
        <Suspense fallback={<ChartFrameSkeleton title="Live snapshot" />}>
          <LiveSnapshot />
        </Suspense>
      </Section>

      <Section title="ViewSwitch and StatusBadge (home page views)">
        <p className="mb-3 text-small text-muted">
          The header control on the home page: a radio group from 640 px, a select below. Choosing a view here goes to the home page.
        </p>
        <ViewSwitch view="planner" home="/dev/components" />
        <div className="mt-4 flex flex-wrap gap-2">
          {LEVEL_ORDER.map((level) => <StatusBadge key={level} level={level} />)}
        </div>
      </Section>

      <Section title="KpiTile">
        <div className="card-grid sm:grid-cols-3">
          <KpiTile label="Average of daily median bed waits" value={7.82} unit="hours" meta={edMeta} now={SAMPLE_NOW}
                   change={{ value: -5.7, unit: "%", label: "vs the median of the previous 8 weeks" }} />
          <KpiTile label="Attendances (week)" value={4812} unit="patients" meta={edMeta} now={SAMPLE_NOW}
                   format={(v) => v.toLocaleString("en-SG")} change={{ value: 3.1, unit: "%", label: "vs the median of the previous 8 weeks" }} />
          <KpiTile label="Attendances (week)" value={null} unit="patients" meta={edMeta} now={SAMPLE_NOW}
                   change={{ value: null, label: "vs the median of the previous 8 weeks" }} caveat="No complete week yet" />
        </div>
      </Section>

      <Section title="ChartFrame">
        <div className="card-grid lg:grid-cols-2">
          <ChartFrame title="Median wait for a ward bed" meta={edMeta} now={SAMPLE_NOW} summary="A placeholder for a chart." csv="/export/ed-daily.csv?context=1"
                      table={<p className="text-small">The figures as a table go here.</p>} description="Daily median, by hospital. The chart goes here.">
            <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-line text-small text-muted">
              chart slot
            </div>
          </ChartFrame>
          <ChartFrame title="CHAS clinics near seniors" meta={clinicMeta} now={SAMPLE_NOW} summary="A placeholder for a map." csv="/export/areas.csv?context=1" table={{ href: "/access-map?view=table" }}>
            <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-line text-small text-muted">
              chart slot (old source: the badge says so)
            </div>
          </ChartFrame>
          <ChartFrame title="Inside a section" meta={edMeta} now={SAMPLE_NOW} section={edMeta} summary="A chart whose section already states the date and source."
                      csv="/export/ed-daily.csv?context=1" table="self">
            <p>No date or source of its own: the section&apos;s line covers it.</p>
          </ChartFrame>
          <ChartFrame title="Empty" meta={edMeta} now={SAMPLE_NOW} state="empty" summary="No figures." csv="/export/ed-daily.csv?context=1" table="self"><p>never shown</p></ChartFrame>
          <ChartFrame title="Could not load" meta={edMeta} now={SAMPLE_NOW} state="error" retryHref="/dev/components" summary="Failed to load." csv="/export/ed-daily.csv?context=1" table="self"><p>never shown</p></ChartFrame>
          <ChartFrame title="Without a date" meta={{ ...edMeta, as_of: "" }} summary="Never shown." csv="/export/ed-daily.csv?context=1" table="self">
            <p>This is never shown.</p>
          </ChartFrame>
        </div>
      </Section>

      <Section title="FreshnessBadge">
        <div className="flex flex-wrap gap-2">
          <FreshnessBadge freshness={datasetFreshness("moh_bed_waits", "2026-10-31", SAMPLE_NOW)} />
          <FreshnessBadge freshness={datasetFreshness("moh_bed_waits", "2026-10-20", SAMPLE_NOW)} />
          <FreshnessBadge freshness={datasetFreshness("datagov_chas", "2024-06-06T14:36:42", SAMPLE_NOW)} />
          <FreshnessBadge freshness={datasetFreshness("singstat_residents", "2026-06-30", SAMPLE_NOW)} />
          <FreshnessBadge freshness={datasetFreshness("moh_bed_waits", "", SAMPLE_NOW)} />
        </div>
      </Section>

      <Section title="CaveatChip">
        <div className="flex flex-wrap gap-2">
          <CaveatChip>Unit inferred, not stated by MOH</CaveatChip>
          <CaveatChip tone="warning">63 days with a median wait over 24 hours</CaveatChip>
        </div>
      </Section>

      <Section title="EmptyState, ErrorState, Skeleton">
        <div className="card-grid lg:grid-cols-3">
          <EmptyState title="No clinics in this area" message="Try a wider area, or clear the CDMP filter." />
          <ErrorState error={{ code: "unknown_hospital", message: "Unknown hospital 'XYZ'; use one of AH, CGH, KTPH, …" }} />
          <div className="space-y-2 rounded-lg border border-line bg-surface card">
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      </Section>

      <Section title="DeltaNumber">
        <p className="mb-3 text-small text-muted">
          Value, unit, comparison, and the change as an arrow and a word. Colour comes from the insight&apos;s direction, never
          from the arrow: the same ▲ is brick red for a longer wait and violet for more clinics. Neutral findings have no colour.
        </p>
        <div className="card-grid sm:grid-cols-2 lg:grid-cols-4">
          {storySample.map((i) => (
            <div key={i.insight_id} className="rounded-lg border border-line bg-surface card">
              <DeltaNumber {...deltaFromDisplay(i.display, i.direction)} />
            </div>
          ))}
          <div className="rounded-lg border border-line bg-surface card">
            <DeltaNumber value="1.40" unit="per 1,000 residents aged 65+" label="Sample: clinics in an area that gained some"
                         comparison="1.27, the benchmark rate" change="up" word="higher than the benchmark rate" direction="better" />
          </div>
        </div>
      </Section>

      <Section title="HighlightPhrase">
        <p className="mb-3 text-small text-muted">
          A static marker stroke under a phrase (server HTML, no motion).
        </p>
        <p className="text-h2 text-ink"><HighlightPhrase>19.5% of Singapore residents</HighlightPhrase> were aged 65 or over.</p>
      </Section>

      <Section title="AnnotatedChart">
        <p className="mb-3 text-small text-muted">
          Server-rendered SVG: direct labels, one callout arrow at the highlighted point, gaps for missing values, and a legend only
          with more than 3 series. The headline findings of data-2026-11-08, then a 4-series sample.
        </p>
        <div className="card-grid lg:grid-cols-2">
          {storySample.map((i) => (
            <AnnotatedChart key={i.insight_id} id={`dev-${i.insight_id}`} title={chartTitle(i)} description={i.chart.y_label}
                            meta={{ ...insightMeta, as_of: i.as_of }} format={chartFormat(i)} {...fromInsightChart(i.chart)} />
          ))}
          <AnnotatedChart id="dev-legend" title="Sample: four series, so a legend" meta={insightMeta} kind="line"
                          categories={["Mon", "Tue", "Wed", "Thu", "Fri"].map((d) => ({ key: d, label: d }))}
                          series={[0, 1, 2, 3].map((k) => ({ key: `s${k}`, label: `Sample hospital ${k + 1}`,
                                                             values: [3 + k, 3.5 + k, k === 2 ? null : 3.2 + k, 3.8 + k, 3.6 + k] }))}
                          highlight={["Thu"]} callout="Thursday: the highest for all four" format={(v) => v.toFixed(1)} />
        </div>
      </Section>

      <Section title="Palette">
        <p className="mb-3 text-small text-muted">One accent. Status colours only appear with a text label. Map: Viridis, light = low.</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(colors)
            .filter(([k]) => !k.startsWith("map"))
            .map(([name, hex]) => (
              <div key={name} className="w-28 rounded-md border border-line bg-surface p-2 text-meta">
                <div className="mb-1 h-8 rounded" style={{ background: hex }} />
                {name}
                <br />
                <span className="font-mono text-muted">{hex}</span>
              </div>
            ))}
        </div>
        <div className="mt-4 flex items-stretch gap-1" aria-label="Map scale, low to high, then no data">
          {mapScale.map((hex, i) => (
            <div key={hex} className="h-8 flex-1 rounded" style={{ background: hex }} title={`Class ${i + 1}`} />
          ))}
          <div className="bg-nodata h-8 flex-1 rounded border border-line" title="No data" />
        </div>
        <div className="mt-1 flex justify-between text-meta text-muted">
          <span>Low</span>
          <span>High · then “no data” (hatched)</span>
        </div>
      </Section>
    </>
  );
}
