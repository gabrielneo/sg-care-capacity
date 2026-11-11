import { ErrorState } from "@/components/States";
import { CareMap } from "@/components/home/CareMap";
import type { MapHospital } from "@/components/home/CareMapLeaflet";
import { HomeHero } from "@/components/home/HomeHero";
import { MethodsDrawer } from "@/components/home/MethodsDrawer";
import { type NearbyLists, NearbyResults } from "@/components/home/NearbyResults";
import { StatusGrid } from "@/components/home/StatusGrid";
import { Takeaways } from "@/components/home/Takeaways";
import { WeekPattern } from "@/components/home/WeekPattern";
import { api, settle } from "@/lib/api/client";
import type { Clinic, Meta } from "@/lib/api/types";
import { plainError } from "@/lib/copy";
import { renderDocList } from "@/lib/docs";
import { coversWindow, findingFor, latestCompleteWeek, type Profile, profileFetchFrom, profileWindow, usualLevels, weekdayProfile } from "@/lib/edCompare";
import { type GpPlace, type HospitalPlace, locate, type Located, NEAREST, nearest, type Place, type Places } from "@/lib/nearby";
import { fetchAllPages } from "@/lib/paging";
import { byPressure, hospitalStatus, SPARK_WEEKS } from "@/lib/status";
import { takeaways } from "@/lib/takeaways";

export const dynamic = "force-dynamic"; // rendered per request (the search is in the URL); API responses are cached for an hour

type Search = Promise<Record<string, string | string[] | undefined>>;
const LIMITS_MARKER = "**What the data can't show**";
const DAY = 86_400_000;
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

async function allClinics(): Promise<{ items: Clinic[]; meta: Meta | null }> {
  let meta: Meta | null = null;
  // About 1,200 clinics: 3 pages of 500, asked for at once (one round trip, not three).
  const { items } = await fetchAllPages(async (offset, limit) => {
    const page = await api.clinics({ limit, offset });
    if (offset === 0) meta = page.meta;
    return page.data;
  }, 500, 20, 3);
  return { items, meta };
}

const hasPoint = <T extends { latitude?: number | null; longitude?: number | null }>(p: T): p is T & { latitude: number; longitude: number } =>
  p.latitude != null && p.longitude != null;

/**
 * The home page: how busy each ED was last week, clinics near a postcode, a map, the busiest
 * weekdays and the top findings. Every number comes from the API; the statistics sit in a closed
 * drawer at the bottom, and the full findings on /findings.
 */
export default async function HomePage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams;
  const near = (Array.isArray(params.near) ? params.near[0] : params.near)?.slice(0, 60) ?? "";
  const searching = near.trim() !== "";

  // Everything is asked for at once. The daily figures start from a guess at the weekday window
  // (lib/edCompare.ts, profileFetchFrom); only if MOH is unusually far behind is a second call needed.
  const earlyFrom = profileFetchFrom(new Date().toISOString().slice(0, 10));
  const [hospitalsRes, weeklyRes, liveRes, insightsRes, polyRes, clinicsRes, limits, earlyDailyRes] = await Promise.all([
    settle(api.hospitals()),
    settle(api.edWeekly({ weeks: SPARK_WEEKS + 1 })),
    settle(api.liveNuhsLatest()),
    settle(api.insights()),
    settle(api.polyclinics()),
    searching ? settle(allClinics()) : Promise.resolve(null),
    renderDocList("case_study.md", LIMITS_MARKER),
    settle(api.edDaily({ from: earlyFrom })),
  ]);

  const hospitals = hospitalsRes.ok ? hospitalsRes.value.data : [];
  const codes = hospitals.map((h) => h.hospital_code);
  const weekly = weeklyRes.ok ? weeklyRes.value.data : [];
  const latest = latestCompleteWeek(weekly);
  const usual = usualLevels(weekly, codes, latest);
  const statuses = codes.map((c) => hospitalStatus(c, usual[c], weekly, latest)).sort(byPressure);
  const live = liveRes.ok ? liveRes.value.data : [];
  const insights = insightsRes.ok ? insightsRes.value.data : [];
  const top = takeaways(insights, codes);

  // The weekday pattern: daily figures for the 26 complete weeks up to the latest.
  const window = latest ? profileWindow(latest) : null;
  const dailyRes = !window ? null
    : earlyDailyRes.ok && coversWindow(earlyFrom, window) ? earlyDailyRes
    : await settle(api.edDaily({ from: window.from, to: window.to }));
  const profiles = dailyRes?.ok && window
    ? codes.map((c) => weekdayProfile(dailyRes.value.data, c, window.from, window.to, "usual")).filter((p): p is Profile => p != null)
    : [];

  // Places, for the search and the map.
  const polyclinics: Place[] = polyRes.ok
    ? polyRes.value.data.filter(hasPoint).map((p) => ({ name: p.polyclinic_name, address: p.address, postal_code: p.postal_code,
        latitude: p.latitude, longitude: p.longitude }))
    : [];
  const hospitalPlaces: HospitalPlace[] = hospitals.filter(hasPoint).map((h) => ({
    code: h.hospital_code, name: h.hospital_name, address: null, postal_code: h.postal_code ?? null,
    latitude: h.latitude, longitude: h.longitude, facility_type: h.facility_type }));
  const gps: GpPlace[] = clinicsRes?.ok
    ? clinicsRes.value.items.filter(hasPoint).map((c) => ({ name: c.clinic_name ?? "Clinic", address: c.address,
        postal_code: c.postal_code, latitude: c.latitude, longitude: c.longitude, planning_area: c.planning_area, has_cdmp: c.has_cdmp }))
    : [];
  const places: Places = { gps, polyclinics, hospitals: hospitalPlaces };
  const located: Located | null = searching ? locate(near, places) : null;
  // Releases before 2026-11-09 have no polyclinic list: the search still works with GP clinics alone.
  const ready = clinicsRes?.ok;
  const lists: NearbyLists | null = located?.ok && ready ? {
    polyclinics: nearest(located, polyclinics, NEAREST.polyclinics),
    gps: nearest(located, gps, NEAREST.gps),
    hospitals: nearest(located, hospitalPlaces, NEAREST.hospitals),
  } : null;

  const level = new Map(statuses.map((s) => [s.code, s.level]));
  const mapHospitals: MapHospital[] = hospitalPlaces.map((h) => ({ code: h.code, name: h.name, latitude: h.latitude,
    longitude: h.longitude, level: level.get(h.code) ?? "unknown" }));

  return (
    <>
      <HomeHero near={near} />

      {located ? (
        <NearbyResults located={located} lists={lists} clinicMeta={clinicsRes?.ok ? clinicsRes.value.meta : null}
                       polyclinicMeta={polyRes.ok ? polyRes.value.meta : null} />
      ) : null}

      {hospitalsRes.ok && weeklyRes.ok ? (
        <StatusGrid statuses={statuses} hospitals={hospitals} live={live} meta={weeklyRes.value.meta}
                    latestWeek={latest ? { week_start: latest, week_end: addDays(latest, 6) } : null} />
      ) : (
        <section className="py-8">
          <ErrorState title="Hospital figures can't be shown right now"
                      error={plainError((hospitalsRes.ok ? (weeklyRes as { error: Error }).error : hospitalsRes.error))} />
        </section>
      )}

      {mapHospitals.length || polyclinics.length ? (
        <section aria-labelledby="map-heading" className="py-8" data-testid="map-section">
          <h2 id="map-heading" className="text-xl font-semibold tracking-tight text-ink">On the map</h2>
          <p className="mb-3 mt-1 max-w-prose text-sm text-muted">
            Hospitals are coloured by last week&apos;s bed wait. {located?.ok ? "Your search and the nearest clinics are marked." : "Search above to see the clinics near you."}
          </p>
          <CareMap hospitals={mapHospitals} polyclinics={polyclinics.map(({ name, latitude, longitude }) => ({ name, latitude, longitude }))}
                   gps={lists ? lists.gps.map((n) => ({ name: n.place.name, latitude: n.place.latitude, longitude: n.place.longitude })) : []}
                   focus={lists ? [...lists.gps, ...lists.polyclinics, ...lists.hospitals.slice(0, 1)]
                     .map((n) => ({ name: n.place.name, latitude: n.place.latitude, longitude: n.place.longitude })) : []}
                   here={located?.ok ? { name: located.label, label: located.label, latitude: located.latitude, longitude: located.longitude } : null} />
        </section>
      ) : null}

      {profiles.length && dailyRes?.ok ? (
        <WeekPattern profiles={profiles} hospitals={hospitals} finding={findingFor(insights, "weekday")} meta={dailyRes.value.meta} />
      ) : null}

      {insightsRes.ok ? <Takeaways items={top} meta={insightsRes.value.meta} /> : null}

      <MethodsDrawer findings={insights.filter((i) => top.some((t) => t.id === i.insight_id))} limits={limits.content} />
    </>
  );
}
