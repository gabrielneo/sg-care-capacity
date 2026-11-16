import type { Metadata } from "next";
import Link from "next/link";
import { type ReactNode, Suspense } from "react";

import { ErrorState, Skeleton } from "@/components/States";
import { EdNearby } from "@/components/home/EdNearby";
import { EdNearbyCard } from "@/components/home/EdNearbyCard";
import { Finder } from "@/components/home/Finder";
import { FinderMap } from "@/components/home/FinderMap";
import { HospitalDrawerBody } from "@/components/home/HospitalDrawerBody";
import { HomeNotice } from "@/components/home/HomeHero";
import { LocationSource } from "@/components/home/LocationSource";
import { MethodsDrawer } from "@/components/home/MethodsDrawer";
import { StatusGrid } from "@/components/home/StatusGrid";
import { SummaryStrip } from "@/components/home/SummaryStrip";
import { WhatChanged } from "@/components/home/WhatChanged";
import { JumpMenu } from "@/components/JumpMenu";
import { MobileAccordion } from "@/components/MobileAccordion";
import { OnThisPage } from "@/components/OnThisPage";
import { SectionHeading } from "@/components/SectionHeading";
import { SiteStrip } from "@/components/SiteStrip";
import { Takeaways } from "@/components/home/Takeaways";
import { WeekPattern } from "@/components/home/WeekPattern";
import { Provenance } from "@/components/Provenance";
import { Glossed } from "@/components/terms/Glossed";
import { api, settle } from "@/lib/api/client";
import type { CareRow } from "@/lib/careMapState";
import { plainError } from "@/lib/copy";
import { renderDocList } from "@/lib/docs";
import { coversWindow, findingFor, latestCompleteWeek, type Profile, profileFetchFrom, profileWindow, usualLevels, weekdayProfile } from "@/lib/edCompare";
import { chaptersFor, type Density, densityOf, jumpTargets, parseView, type SectionId, sectionAnchor, sectionsFor, viewHref, VIEWS } from "@/lib/homeViews";
import { parseSort, sortStatuses } from "@/lib/planner";
import { shortNote } from "@/lib/hospitalNotes";
import { isUrgentCare, rankableCodes, splitByCare } from "@/lib/hospitals";
import { EVIDENCE_LABEL, evidenceOf, sampleText } from "@/lib/evidence";
import { hospitalStatus, SPARK_WEEKS } from "@/lib/status";
import { buildStrip } from "@/lib/strip";
import { takeaways } from "@/lib/takeaways";
import { weekChanges } from "@/lib/weekChanges";
import { formatWindow } from "@/lib/windows";

export const metadata: Metadata = { title: "Find a clinic and check bed waits" };
export const dynamic = "force-dynamic"; // rendered per request (the search and the view are in the URL); API responses are cached for an hour

type Search = Promise<Record<string, string | string[] | undefined>>;
const LIMITS_MARKER = "**What the data can't show**";
const DAY = 86_400_000;
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/**
 * The find page (the home page before the landing page, 16 Nov 2026): how long each ED's bed waits were last week, and, depending on the view (?view=), clinics near
 * a postcode and a map (public), a summary and the top findings (planner), or those plus the
 * the weekdays with the longest bed waits and the statistics (analyst). Which sections a view shows, and how much of
 * each, is lib/homeViews.ts; this page builds each section once and renders the ones it is given.
 * Every number comes from the API, and a view never changes how one is computed.
 */
export default async function FindPage({ searchParams }: { searchParams: Search }) {
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
  const top = takeaways(insights, hospitals);

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
        return st ? [{ code: st.code, level: st.level, latest: st.latest, usual: st.usual, pct: st.pct, name: h.hospital_name, shortName: h.short_name ?? null, cluster: h.cluster,
          latitude: h.latitude ?? null, longitude: h.longitude ?? null, note: shortNote(h), urgentCare: isUrgentCare(h) }] : [];
      })
    : [];

  const latestWeek = latest ? { week_start: latest, week_end: addDays(latest, 6) } : null;
  const statusOk = hospitalsRes.ok && weeklyRes.ok;

  // The sticky status strip is for Planner and Analyst only: the same count as the cards, built here from the same statuses.
  const strip = view !== "public" && hospitalsRes.ok && weeklyRes.ok
    ? buildStrip({ hospitals, weekly, weeklyMeta: weeklyRes.value.meta, live, liveMeta: liveRes.ok ? liveRes.value.meta : null, now: new Date() })
    : null;

  // One builder per section. The view's config decides which run, in what order and at what density.
  const render: Record<SectionId, (density: Density) => ReactNode> = {
    notice: (density) => <HomeNotice density={density} printHref={view === "analyst" ? "/summary" : undefined} />,

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
          <section data-testid="ed-near">
            <ErrorState title="Hospital figures can't be shown right now"
                        error={plainError((hospitalsRes.ok ? (weeklyRes as { error: Error }).error : hospitalsRes.error))} />
          </section>
        );
      }
      const byCode = new Map(hospitals.map((h) => [h.hospital_code, h]));
      const cards = Object.fromEntries(statuses.flatMap((st) => {
        const h = byCode.get(st.code);
        const reading = live.find((r) => r.hospital_code === st.code && r.is_adult_ed) ?? null;
        return h ? [[st.code, <EdNearbyCard key={st.code} status={st} hospital={h} live={reading} weeklyAsOf={weeklyRes.value.meta.as_of} />]] : [];
      }));
      const exclusions = hospitals.find((h) => h.exclusions_note)?.exclusions_note ?? null;
      return (
        <EdNearby cards={cards} analystHref={viewHref("analyst")}
                  notes={<>
                    {latestWeek ? <p>{formatWindow({ kind: "latest_week", week: latestWeek }, { capital: true })}: weekly figures, not live.</p> : null}
                    {exclusions ? <p data-testid="status-exclusions"><Glossed text={exclusions} /></p> : null}
                  </>}
                  provenance={<>
                    <Provenance meta={weeklyRes.value.meta} compact large />
                    {live.length && liveRes.ok ? <Provenance meta={liveRes.value.meta} compact large /> : null}
                    <LocationSource hospitals={hospitals} />
                  </>} />
      );
    },

    // Without the hospital figures the cards below show the one error message; no second one here.
    summary: () => (statusOk ? (
      <SummaryStrip statuses={statuses} hospitals={hospitals} meta={weeklyRes.value.meta} latestWeek={latestWeek} />
    ) : null),

    changes: () => {
      if (!statusOk) return null;
      // Full EDs only (the urgent care centre is never counted). With no comparison for any of them, "none is higher" would say nothing.
      const rankable = splitByCare(statuses, (st) => st.code, hospitals).rankable;
      const compared = rankable.filter((st) => st.level !== "unknown");
      const higher = compared.length ? compared.filter((st) => st.level === "higher" || st.level === "much_higher").length : null;
      return <WhatChanged changes={weekChanges(weekly, rankableCodes(hospitals), latest, rankable)} names={names} meta={weeklyRes.value.meta} latestWeek={latestWeek} higher={higher} />;
    },

    hospitals: (density) => (statusOk ? (
      <StatusGrid statuses={statuses} hospitals={hospitals} live={live} meta={weeklyRes.value.meta} latestWeek={latestWeek} density={density}
                  sort={density === "full" ? sort : undefined} query={view === "public" ? "" : `view=${view}`} />
    ) : (
      <section>
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
        <section aria-labelledby="map-heading" data-testid="map-section">
          <SectionHeading id="map-heading"
            lede="Hospitals are coloured by the latest complete week's bed wait against their own usual, with a symbol and words. Search above to mark your search.">
            Where are the hospitals, and how did each compare with usual?
          </SectionHeading>
          <Suspense fallback={<Skeleton className="h-map w-full rounded-xl" label="Loading map" />}>
            <FinderMap rows={careRows} bodies={bodies} polyclinics={polyclinics}
                       provenance={weeklyRes.ok ? <div className="mt-3"><Provenance meta={weeklyRes.value.meta} compact large /><LocationSource hospitals={hospitals} /></div> : null} />
          </Suspense>
        </section>
      );
    },

    takeaways: (density) => {
      if (!insightsRes?.ok) return null;
      const evidence = density === "full"
        ? Object.fromEntries(insights.filter((i) => top.some((t) => t.id === i.insight_id)).map((i) => [i.insight_id, { level: EVIDENCE_LABEL[evidenceOf(i)], sample: sampleText(i) }]))
        : {};
      return <Takeaways items={top} meta={insightsRes.value.meta} density={density} evidence={evidence} />;
    },

    // Below 768px the heatmap and the methods are accordions, closed until opened; the fragment (#section-weekdays) keeps the state.
    weekdays: () => (profiles.length && dailyRes?.ok && window ? (
      <MobileAccordion anchor={sectionAnchor("weekdays")} label="Show the weekday heatmap">
        <WeekPattern profiles={profiles} hospitals={hospitals} finding={findingFor(insights, "weekday", hospitals)} meta={dailyRes.value.meta}
                      from={window.from} to={window.to} />
      </MobileAccordion>
    ) : null),

    // Full (analyst): open, with the statistics behind each takeaway. Simple: closed, definitions and limits only.
    methods: (density) => {
      const drawer = (
        <MethodsDrawer open={density === "full"} limits={limits.content} audience={view === "public" ? "public" : "analyst"}
                       findings={density === "full" ? insights.filter((i) => top.some((t) => t.id === i.insight_id)) : []} />
      );
      return view === "public" ? drawer : <MobileAccordion anchor={sectionAnchor("methods")} label="Show how these figures are made">{drawer}</MobileAccordion>;
    },
  };

  // Chapters: each run of sections that share a chapter is one block, and the blocks alternate page and band (lib/homeViews.ts).
  const shown = sectionsFor(view).flatMap(({ id, density, chapter }) => { const el = render[id](density); return el ? [{ id, el, chapter }] : []; });
  const chapters = chaptersFor(shown);
  const stops = jumpTargets(view).filter((t) => shown.some((s) => s.id === t.id)).map((t) => ({ id: sectionAnchor(t.id), label: t.label }));
  // Only Analyst has the "On this page" list (from 1280px) and, below 768px, a "Jump to section" menu (from 768px the strip has one).
  const rail = view === "analyst" && stops.length > 1;

  const body = (
    <>
      {chapters.map((c, i) => (
        <div key={c.items[0]!.id} data-chapter={c.chapter} data-tone={c.tone}
             className={`section ${c.tone === "band" ? "section-band" : ""} ${i === 0 ? "section-first" : ""} ${view === "public" && i > 1 ? "" : "section-compact"}`}>
          {c.items.map((s) => <div key={s.id} id={sectionAnchor(s.id)} data-section={s.id} className={c.items.length > 1 ? "section-in-chapter" : undefined}>{s.el}</div>)}
          {/* Phones: "Jump to section" sits right under the heading and the notice (from 768px the strip has one). */}
          {rail && i === 0 ? <JumpMenu items={stops} className="mt-3 md:hidden" /> : null}
          {rail && c.tone === "band" ? <p className="back-to-top text-small"><a href="#main" data-testid="back-to-top" className="inline-flex min-h-11 items-center">Back to top</a></p> : null}
        </div>
      ))}
    </>
  );

  return (
    <div data-testid="home" data-view={view}>
      {strip ? <SiteStrip strip={strip} targets={jumpTargets(view)} /> : null}
      {/* Without JavaScript, a phone has no view control (it is in the menu sheet): the three views as plain links. */}
      <noscript>
        <nav aria-label="View (no script)" className="mb-3 flex flex-wrap gap-x-4 lg:hidden">
          {VIEWS.map((v) => <Link key={v.id} href={viewHref(v.id)} aria-current={v.id === view ? "true" : undefined} className="inline-flex min-h-11 items-center">{v.label}</Link>)}
        </nav>
      </noscript>
      {rail ? (
        <div className="rail-layout">
          <div className="min-w-0">{body}</div>
          <aside className="rail" aria-label="Page contents"><OnThisPage items={stops} /></aside>
        </div>
      ) : body}
    </div>
  );
}
