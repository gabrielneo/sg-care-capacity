import Link from "next/link";
import { Fragment, type ReactNode, Suspense } from "react";

import { ErrorState, Skeleton } from "@/components/States";
import { EdNearby } from "@/components/home/EdNearby";
import { EdNearbyCard } from "@/components/home/EdNearbyCard";
import { Finder } from "@/components/home/Finder";
import { FinderMap } from "@/components/home/FinderMap";
import { HospitalDrawerBody } from "@/components/home/HospitalDrawerBody";
import { HomeNotice } from "@/components/home/HomeHero";
import { MethodsDrawer } from "@/components/home/MethodsDrawer";
import { StatusGrid } from "@/components/home/StatusGrid";
import { SummaryStrip } from "@/components/home/SummaryStrip";
import { WhatChanged } from "@/components/home/WhatChanged";
import { Takeaways } from "@/components/home/Takeaways";
import { WeekPattern } from "@/components/home/WeekPattern";
import { Provenance } from "@/components/Provenance";
import { Glossed } from "@/components/terms/Glossed";
import { api, settle } from "@/lib/api/client";
import type { CareRow } from "@/lib/careMapState";
import { plainError } from "@/lib/copy";
import { renderDocList } from "@/lib/docs";
import { coversWindow, findingFor, latestCompleteWeek, type Profile, profileFetchFrom, profileWindow, usualLevels, weekdayProfile } from "@/lib/edCompare";
import { type Density, densityOf, parseView, type SectionId, sectionsFor, viewHref } from "@/lib/homeViews";
import { parseSort, sortStatuses } from "@/lib/planner";
import { shortNote } from "@/lib/hospitalNotes";
import { hospitalStatus, SPARK_WEEKS } from "@/lib/status";
import { takeaways } from "@/lib/takeaways";
import { weekChanges } from "@/lib/weekChanges";
import { formatWeek } from "@/lib/weeks";

export const dynamic = "force-dynamic"; // rendered per request (the search and the view are in the URL); API responses are cached for an hour

type Search = Promise<Record<string, string | string[] | undefined>>;
const LIMITS_MARKER = "**What the data can't show**";
const DAY = 86_400_000;
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/**
 * The home page: how busy each ED was last week, and, depending on the view (?view=), clinics near
 * a postcode and a map (public), a summary and the top findings (planner), or those plus the
 * busiest weekdays and the statistics (analyst). Which sections a view shows, and how much of
 * each, is lib/homeViews.ts; this page builds each section once and renders the ones it is given.
 * Every number comes from the API, and a view never changes how one is computed.
 */
export default async function HomePage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams;
  const view = parseView(params.view);
  // The order of the hospital cards (lib/planner.ts). Only the full cards have the control; elsewhere it is the default.
  const sort = densityOf(view, "hospitals") === "full" ? parseSort(params.sort) : parseSort(null);
  const shows = (id: SectionId) => densityOf(view, id) != null;
  const wantInsights = shows("takeaways") || densityOf(view, "methods") === "full";
  const wantPlaces = shows("finder") || shows("map");

  // Everything the view needs is asked for at once, and nothing it doesn't show. The daily figures start from a guess at the weekday window
  // (lib/edCompare.ts, profileFetchFrom); only if MOH is unusually far behind is a second call needed.
  const earlyFrom = profileFetchFrom(new Date().toISOString().slice(0, 10));
  const [hospitalsRes, weeklyRes, liveRes, insightsRes, polyRes, clinicMetaRes, limits, earlyDailyRes] = await Promise.all([
    settle(api.hospitals()),
    settle(api.edWeekly({ weeks: SPARK_WEEKS + 1 })),
    settle(api.liveNuhsLatest()),
    wantInsights ? settle(api.insights()) : Promise.resolve(null),
    wantPlaces ? settle(api.polyclinics()) : Promise.resolve(null),
    // Only the clinic list's date and source: the places themselves are fetched by the browser (app/places.json).
    shows("finder") ? settle(api.clinics({ limit: 1 })) : Promise.resolve(null),
    renderDocList("case_study.md", LIMITS_MARKER),
    shows("weekdays") ? settle(api.edDaily({ from: earlyFrom })) : Promise.resolve(null),
  ]);

  const hospitals = hospitalsRes.ok ? hospitalsRes.value.data : [];
  const codes = hospitals.map((h) => h.hospital_code);
  const weekly = weeklyRes.ok ? weeklyRes.value.data : [];
  const latest = latestCompleteWeek(weekly);
  const usual = usualLevels(weekly, codes, latest);
  const names = Object.fromEntries(hospitals.map((h) => [h.hospital_code, h.hospital_name]));
  const statuses = sortStatuses(codes.map((c) => hospitalStatus(c, usual[c], weekly, latest)), sort, names);
  const live = liveRes.ok ? liveRes.value.data : [];
  const insights = insightsRes?.ok ? insightsRes.value.data : [];
  const top = takeaways(insights, codes);

  // The weekday pattern: daily figures for the 26 complete weeks up to the latest.
  const window = latest && earlyDailyRes ? profileWindow(latest) : null;
  const dailyRes = !window || !earlyDailyRes ? null
    : earlyDailyRes.ok && coversWindow(earlyFrom, window) ? earlyDailyRes
    : await settle(api.edDaily({ from: window.from, to: window.to }));
  const profiles = dailyRes?.ok && window
    ? codes.map((c) => weekdayProfile(dailyRes.value.data, c, window.from, window.to, "usual")).filter((p): p is Profile => p != null)
    : [];

  // Places for the map before any search. The search itself runs in the browser (lib/finderStore.ts).
  const hasPoint = <T extends { latitude?: number | null; longitude?: number | null }>(p: T): p is T & { latitude: number; longitude: number } =>
    p.latitude != null && p.longitude != null;
  const polyclinics = polyRes?.ok
    ? polyRes.value.data.filter(hasPoint).map((p) => ({ name: p.polyclinic_name, latitude: p.latitude, longitude: p.longitude }))
    : [];

  // The hospitals for the map and its list: the same statuses as the cards (lib/status.ts), with the cluster from dim_hospital.
  // Without the hospital figures there are none: the cards' error message is the one place that says so.
  const statusByCode = new Map(statuses.map((st) => [st.code, st]));
  const careRows: CareRow[] = hospitalsRes.ok && weeklyRes.ok
    ? hospitals.flatMap((h) => {
        const st = statusByCode.get(h.hospital_code);
        return st ? [{ code: st.code, level: st.level, latest: st.latest, usual: st.usual, pct: st.pct, name: h.hospital_name, cluster: h.cluster,
          latitude: h.latitude ?? null, longitude: h.longitude ?? null, note: shortNote(h) }] : [];
      })
    : [];

  const latestWeek = latest ? { week_start: latest, week_end: addDays(latest, 6) } : null;
  const statusOk = hospitalsRes.ok && weeklyRes.ok;

  // One builder per section. The view's config decides which run, in what order and at what density.
  const render: Record<SectionId, (density: Density) => ReactNode> = {
    notice: (density) => <HomeNotice density={density} />,

    // The search, in the browser: the page only supplies the lists' dates and sources.
    finder: () => (
      <Finder clinicAsOf={clinicMetaRes?.ok ? clinicMetaRes.value.meta.as_of : null}
              provenance={
                <div className="grid gap-x-6 md:grid-cols-2">
                  {polyRes?.ok ? <Provenance meta={polyRes.value.meta} compact large /> : null}
                  {clinicMetaRes?.ok ? <Provenance meta={clinicMetaRes.value.meta} compact large /> : null}
                </div>
              } />
    ),

    // The nearest three EDs: every hospital's card is made here, and the browser shows the nearest three.
    ednear: () => {
      if (!statusOk) {
        return (
          <section className="py-8" data-testid="ed-near">
            <ErrorState title="Hospital figures can't be shown right now"
                        error={plainError((hospitalsRes.ok ? (weeklyRes as { error: Error }).error : hospitalsRes.error))} />
          </section>
        );
      }
      const byCode = new Map(hospitals.map((h) => [h.hospital_code, h]));
      const cards = Object.fromEntries(statuses.flatMap((st) => {
        const h = byCode.get(st.code);
        const reading = live.find((r) => r.hospital_code === st.code && r.is_adult_ed) ?? null;
        return h ? [[st.code, <EdNearbyCard key={st.code} status={st} hospital={h} live={reading} />]] : [];
      }));
      const exclusions = hospitals.find((h) => h.exclusions_note)?.exclusions_note ?? null;
      return (
        <EdNearby cards={cards} analystHref={viewHref("analyst")}
                  notes={<>
                    {latestWeek ? <p>Last week is {formatWeek(latestWeek)}. These are weekly figures, not live.</p> : null}
                    {exclusions ? <p data-testid="status-exclusions"><Glossed text={exclusions} /></p> : null}
                  </>}
                  provenance={<>
                    <Provenance meta={weeklyRes.value.meta} compact large />
                    {live.length && liveRes.ok ? <Provenance meta={liveRes.value.meta} compact large /> : null}
                  </>} />
      );
    },

    // Without the hospital figures the cards below show the one error message; no second one here.
    summary: () => (statusOk ? (
      <SummaryStrip statuses={statuses} hospitals={hospitals} meta={weeklyRes.value.meta} latestWeek={latestWeek} />
    ) : null),

    changes: () => (statusOk ? (
      <WhatChanged changes={weekChanges(weekly, codes, latest, statuses)} names={names} meta={weeklyRes.value.meta} latestWeek={latestWeek} />
    ) : null),

    hospitals: (density) => (statusOk ? (
      <StatusGrid statuses={statuses} hospitals={hospitals} live={live} meta={weeklyRes.value.meta} latestWeek={latestWeek} density={density}
                  sort={density === "full" ? sort : undefined} query={view === "public" ? "" : `view=${view}`} />
    ) : (
      <section className="py-8">
        <ErrorState title="Hospital figures can't be shown right now"
                    error={plainError((hospitalsRes.ok ? (weeklyRes as { error: Error }).error : hospitalsRes.error))} />
      </section>
    )),

    map: () => {
      if (!careRows.length && !polyclinics.length) return null;
      // The details drawer's content for every hospital, made here; the browser shows the one in the address (?hospital=).
      const latestStart = latest;
      const bodies = hospitalsRes.ok && weeklyRes.ok
        ? Object.fromEntries(hospitals.flatMap((h) => {
            const st = statusByCode.get(h.hospital_code);
            const reading = live.find((r) => r.hospital_code === h.hospital_code && r.is_adult_ed) ?? null;
            return st ? [[h.hospital_code, <HospitalDrawerBody key={h.hospital_code} status={st} hospital={h} live={reading}
                                                                meta={weeklyRes.value.meta} latestWeek={latestStart} />]] : [];
          }))
        : {};
      return (
        <section aria-labelledby="map-heading" className="py-8" data-testid="map-section">
          <h2 id="map-heading" className="text-2xl font-semibold tracking-tight text-ink">On the map</h2>
          <p className="mb-3 mt-1 max-w-prose text-base text-ink">
            Hospitals are coloured by last week&apos;s bed wait against their own usual, and marked with a symbol and the words in the list.
            Search above to mark your search and the nearest clinics.
          </p>
          <Suspense fallback={<Skeleton className="h-[380px] w-full rounded-xl sm:h-[460px]" label="Loading map" />}>
            <FinderMap rows={careRows} bodies={bodies} polyclinics={polyclinics}
                       provenance={weeklyRes.ok ? <div className="mt-3"><Provenance meta={weeklyRes.value.meta} compact large /></div> : null} />
          </Suspense>
        </section>
      );
    },

    takeaways: () => (insightsRes?.ok ? <Takeaways items={top} meta={insightsRes.value.meta} /> : null),

    weekdays: () => (profiles.length && dailyRes?.ok ? (
      <WeekPattern profiles={profiles} hospitals={hospitals} finding={findingFor(insights, "weekday")} meta={dailyRes.value.meta} />
    ) : null),

    links: () => (
      <section aria-labelledby="links-heading" className="py-8" data-testid="analyst-links">
        <h2 id="links-heading" className="text-xl font-semibold tracking-tight text-ink">Check the data and the methods</h2>
        <ul className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <li><Link href="/data-quality">Data Quality</Link>: every check, each source&apos;s date and the days with gaps</li>
          <li><Link href="/methodology">Methodology</Link>: sources, definitions and what the figures can&apos;t tell you</li>
          <li><Link href="/docs/insights-method">How findings are tested</Link>: the test and the bar each finding has to pass</li>
          <li><Link href="/ed-trends">Trends by hospital</Link>: each hospital&apos;s daily bed waits, and raw values side by side</li>
        </ul>
      </section>
    ),

    // Full (analyst): open, with the statistics behind each takeaway. Simple: closed, definitions and limits only.
    methods: (density) => (
      <MethodsDrawer open={density === "full"} limits={limits.content}
                     findings={density === "full" ? insights.filter((i) => top.some((t) => t.id === i.insight_id)) : []} />
    ),
  };

  return (
    <div data-testid="home" data-view={view}>
      {sectionsFor(view).map(({ id, density }) => <Fragment key={id}>{render[id](density)}</Fragment>)}
    </div>
  );
}
