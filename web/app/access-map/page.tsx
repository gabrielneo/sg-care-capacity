import type { Metadata } from "next";
import { QuadrantChart } from "@/components/access/QuadrantChart";
import { ShortfallBars } from "@/components/access/ShortfallBars";
import { ChartCard } from "@/components/ChartCard";
import { AccessViews } from "@/components/map3d/AccessViews";
import { AreaTable } from "@/components/map/AreaTable";
import { ViewTabs } from "@/components/map/ViewTabs";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState, ErrorState } from "@/components/States";
import { api, settle } from "@/lib/api/client";
import type { Clinic, Meta } from "@/lib/api/types";
import { CAVEAT, plainError } from "@/lib/copy";
import { priorityAreas, quadrant, shortfallBars } from "@/lib/accessCharts";
import { fetchAllPages } from "@/lib/paging";
import { Glossed } from "@/components/terms/Glossed";

export const metadata: Metadata = { title: "Access Map" };
export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const INTRO = <Glossed text="Where CHAS and CDMP GP clinics are, compared with where residents aged 65 and over live, by area (the 55 URA planning areas)." />;

async function allClinics(): Promise<{ items: Clinic[]; meta: Meta | null }> {
  let meta: Meta | null = null;
  const { items } = await fetchAllPages(async (offset, limit) => {
    const page = await api.clinics({ limit, offset });
    meta ??= page.meta;
    return page.data;
  });
  return { items, meta };
}

const VIEWS = { "3d": "3d", map: "2d", table: "table" } as const;

export default async function AccessMapPage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams;
  const asked = first(params.view);
  const view = asked && asked in VIEWS ? VIEWS[asked as keyof typeof VIEWS] : "auto";
  const table = view === "table";
  const [result, insights] = await Promise.all([
    settle(Promise.all([api.areasAccess(), table ? Promise.resolve(null) : allClinics()])),
    settle(api.insights({ type: "access_gap", top: 10 })),
  ]);

  if (!result.ok) {
    return (
      <>
        <PageHeader title="Access Map" intro={INTRO} />
        <ViewTabs active={table ? "table" : view === "2d" ? "map" : view === "3d" ? "3d" : null} />
        <ErrorState error={plainError(result.error)} />
      </>
    );
  }
  const [areas, clinics] = result.value;
  const features = areas.data.features;
  // The site's own plain caveats (the API's mention internal names); see lib/copy.ts.
  const metricCaveats: Record<string, string> = {
    "fct_area_access.clinics_per_1k_seniors": CAVEAT.clinics,
    "fct_area_access.cdmp_clinics_per_1k_seniors": CAVEAT.clinics,
    "fct_area_access.pct_area_within_1km_of_cdmp":
      "This counts land, including parks and industrial land where no one lives. It uses straight-line distance, not travel time.",
    "fct_area_access.approx_km_centroid_to_nearest_polyclinic":
      "One point stands for the whole area, and it may be far from where people live. Straight-line distance, not travel time.",
  };

  // The access-gap findings, in the engine's priority order: they name the 3D labels and the side charts.
  const findings = insights.ok ? insights.value.data : [];
  const priority = priorityAreas(findings);
  const props = features.map((f) => f.properties);
  const q = quadrant(props, priority);
  const bars = shortfallBars(props, priority);
  const topFinding = findings[0];
  const callout = topFinding?.chart ? { name: topFinding.entity, text: topFinding.chart.callout } : null;
  const side = (
    <aside className="space-y-4" aria-label="The same finding as charts">
      {q ? <QuadrantChart {...q} meta={areas.meta} callout={callout} /> : null}
      {bars.length ? <ShortfallBars bars={bars} meta={areas.meta} top={priority[0] ?? null} /> : null}
    </aside>
  );

  return (
    <>
      <PageHeader title="Access Map" intro={INTRO} />
      {features.length === 0 ? (
        <>
          <ViewTabs active={table ? "table" : null} />
          <EmptyState title="No areas in this week's data release" message="There are no areas to show." />
        </>
      ) : table ? (
        <>
          <ViewTabs active="table" />
          <ChartCard title="Clinic access by area (table)" meta={areas.meta} caveat={CAVEAT.clinics}
                     description="The same figures as the maps. Select a column heading to sort.">
            <AreaTable areas={props} sort={first(params.sort)} dir={first(params.dir)} />
          </ChartCard>
        </>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <ChartCard title="Clinic access by area" meta={areas.meta} caveat={CAVEAT.clinics}
                     description="Counts where clinics are, not where their patients live: residents use clinics in neighbouring areas too.">
            <AccessViews requested={view === "3d" ? "3d" : view === "2d" ? "2d" : "auto"} areas={areas.data}
                         clinics={(clinics?.items ?? []).map((c) => ({ clinic_key: c.clinic_key, clinic_name: c.clinic_name,
                                                                        latitude: c.latitude, longitude: c.longitude, has_cdmp: c.has_cdmp }))}
                         caveats={metricCaveats} labels={priority} />
          </ChartCard>
          {side}
        </div>
      )}
    </>
  );
}
