import type { Metadata } from "next";
import Link from "next/link";

import { ChartCard } from "@/components/ChartCard";
import { AccessMap } from "@/components/map/AccessMap";
import { AreaTable } from "@/components/map/AreaTable";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState, ErrorState } from "@/components/States";
import { api, settle } from "@/lib/api/client";
import type { Clinic, Meta } from "@/lib/api/types";
import { CAVEAT, plainError } from "@/lib/copy";
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

export default async function AccessMapPage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams;
  const view = first(params.view) === "table" ? "table" : "map";
  const result = await settle(Promise.all([api.areasAccess(), view === "map" ? allClinics() : Promise.resolve(null)]));

  const tabs = (
    <nav aria-label="View" className="mb-4 inline-flex rounded-md border border-line bg-surface p-1">
      {(["map", "table"] as const).map((v) => (
        <Link key={v} href={v === "map" ? "/access-map" : "/access-map?view=table"} aria-current={view === v ? "page" : undefined}
              className={`flex min-h-11 items-center rounded px-4 text-sm font-medium no-underline ${
                view === v ? "bg-accent-soft text-accent-strong" : "text-muted hover:text-ink"}`}>
          {v === "map" ? "Map" : "Table"}
        </Link>
      ))}
    </nav>
  );

  if (!result.ok) {
    return (
      <>
        <PageHeader title="Access Map" intro={INTRO} />
        {tabs}
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

  return (
    <>
      <PageHeader title="Access Map" intro={INTRO} />
      {tabs}
      {features.length === 0 ? (
        <EmptyState title="No areas in this week's data release" message="There are no areas to show." />
      ) : view === "map" ? (
        <ChartCard title="Clinic access by area" meta={areas.meta} caveat={CAVEAT.clinics}
                   description="Counts where clinics are, not where their patients live: residents use clinics in neighbouring areas too.">
          <AccessMap areas={areas.data}
                     clinics={(clinics?.items ?? []).map((c) => ({ clinic_key: c.clinic_key, clinic_name: c.clinic_name,
                                                                    latitude: c.latitude, longitude: c.longitude, has_cdmp: c.has_cdmp }))}
                     caveats={metricCaveats} />
        </ChartCard>
      ) : (
        <ChartCard title="Clinic access by area (table)" meta={areas.meta} caveat={CAVEAT.clinics}
                   description="The same figures as the map. Select a column heading to sort.">
          <AreaTable areas={features.map((f) => f.properties)} sort={first(params.sort)} dir={first(params.dir)} />
        </ChartCard>
      )}
    </>
  );
}
