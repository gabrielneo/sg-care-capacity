import type { Metadata } from "next";
import { redirect } from "next/navigation";
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
import { SectionHeading } from "@/components/SectionHeading";
import { Provenance } from "@/components/Provenance";
import { Glossed } from "@/components/terms/Glossed";
import { api, settle } from "@/lib/api/client";
import type { CareRow } from "@/lib/careMapState";
import { plainError } from "@/lib/copy";
import { renderDocList } from "@/lib/docs";
import { latestCompleteWeek, usualLevels } from "@/lib/edCompare";
import { FIND_PATH, type SectionId, sectionAnchor } from "@/lib/homeViews";
import { shortNote } from "@/lib/hospitalNotes";
import { isUrgentCare } from "@/lib/hospitals";
import { hospitalStatus, SPARK_WEEKS } from "@/lib/status";
import { formatWindow } from "@/lib/windows";

export const metadata: Metadata = { title: "Find a clinic and check bed waits" };
export const dynamic = "force-dynamic"; // rendered per request; API responses are cached for an hour

type Search = Promise<Record<string, string | string[] | undefined>>;
const LIMITS_MARKER = "**What the data can't show**";
const DAY = 86_400_000;
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/** The page's chapters, in order: each is one block, alternating page and band, starting with "page". */
const CHAPTERS: readonly { chapter: string; sections: readonly SectionId[] }[] = [
  { chapter: "start", sections: ["notice", "finder"] },
  { chapter: "near", sections: ["ednear"] },
  { chapter: "map", sections: ["map"] },
  { chapter: "methods", sections: ["methods"] },
];

/** The retired Planner and Analyst views' parameter (removed 18 Nov 2026): an old link to one lands on the finder, keeping the
 * map's own state (?sort=, ?layout=, ?cluster=, ?hospital=). */
const RETIRED_PARAMS = ["view"] as const;

/**
 * The clinic finder: clinics and emergency departments near a postcode, how each emergency department's bed wait compared with
 * its usual in the latest complete week, a map, and how the figures are made. Every number comes from the API.
 * (Until 18 Nov 2026 this page also had Planner and Analyst views; the weekly figures they showed are on ED Trends, the
 * findings and the one-page summary.)
 */
export default async function FindPage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams;
  if (RETIRED_PARAMS.some((k) => params[k] != null)) {
    const keep = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if ((RETIRED_PARAMS as readonly string[]).includes(k) || v == null) continue;
      for (const x of Array.isArray(v) ? v : [v]) keep.append(k, x);
    }
    redirect(keep.size ? `${FIND_PATH}?${keep.toString()}` : FIND_PATH);
  }

  const [hospitalsRes, weeklyRes, liveRes, polyRes, clinicMetaRes, limits] = await Promise.all([
    settle(api.hospitals()),
    settle(api.edWeekly({ weeks: SPARK_WEEKS + 1 })),
    settle(api.liveNuhsLatest()),
    settle(api.polyclinics()),
    // Only the clinic list's date and source: the places themselves are fetched by the browser (app/places.json).
    settle(api.clinics({ limit: 1 })),
    renderDocList("case_study.md", LIMITS_MARKER),
  ]);

  const hospitals = hospitalsRes.ok ? hospitalsRes.value.data : [];
  const codes = hospitals.map((h) => h.hospital_code);
  const weekly = weeklyRes.ok ? weeklyRes.value.data : [];
  const latest = latestCompleteWeek(weekly);
  const usual = usualLevels(weekly, codes, latest);
  const statuses = codes.map((c) => hospitalStatus(c, usual[c], weekly, latest));
  const live = liveRes.ok ? liveRes.value.data : [];

  // Places for the map before any search. The search itself runs in the browser (lib/finderStore.ts).
  const hasPoint = <T extends { latitude?: number | null; longitude?: number | null }>(p: T): p is T & { latitude: number; longitude: number } =>
    p.latitude != null && p.longitude != null;
  const polyclinics = polyRes.ok
    ? polyRes.value.data.filter(hasPoint).map((p) => ({ name: p.polyclinic_name, latitude: p.latitude, longitude: p.longitude }))
    : [];

  // The hospitals for the map and its list, with the cluster from dim_hospital. Without the hospital figures there are none.
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

  const render: Record<SectionId, () => ReactNode> = {
    notice: () => <HomeNotice />,

    // The search, in the browser: the page only supplies the lists' dates and sources.
    finder: () => (
      <Finder clinicAsOf={clinicMetaRes.ok ? clinicMetaRes.value.meta.as_of : null}
              provenance={
                <div className="grid gap-x-6 md:grid-cols-2">
                  {polyRes.ok ? <Provenance meta={polyRes.value.meta} compact large /> : null}
                  {clinicMetaRes.ok ? <Provenance meta={clinicMetaRes.value.meta} compact large /> : null}
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
        <EdNearby cards={cards} allHref="/ed-trends"
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

    map: () => {
      if (!careRows.length && !polyclinics.length) return null;
      // The details drawer's content for every hospital, made here; the browser shows the one in the address (?hospital=).
      const bodies = hospitalsRes.ok && weeklyRes.ok
        ? Object.fromEntries(hospitals.flatMap((h) => {
            const st = statusByCode.get(h.hospital_code);
            const reading = live.find((r) => r.hospital_code === h.hospital_code && r.is_adult_ed) ?? null;
            return st ? [[h.hospital_code, <HospitalDrawerBody key={h.hospital_code} status={st} hospital={h} live={reading}
                                                                meta={weeklyRes.value.meta} latestWeek={latest} />]] : [];
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

    // Closed by default: definitions and limits.
    methods: () => <MethodsDrawer open={false} limits={limits.content} audience="public" findings={[]} />,
  };

  const chapters = CHAPTERS
    .map((c) => ({ chapter: c.chapter, items: c.sections.flatMap((id) => { const el = render[id](); return el ? [{ id, el }] : []; }) }))
    .filter((c) => c.items.length);

  return (
    <div data-testid="home" data-view="public">
      {chapters.map((c, i) => {
        const tone = i % 2 ? "band" : "page";
        return (
          <div key={c.chapter} data-chapter={c.chapter} data-tone={tone}
               className={`section ${tone === "band" ? "section-band" : ""} ${i === 0 ? "section-first" : ""} ${i > 1 ? "" : "section-compact"}`}>
            {c.items.map((s) => <div key={s.id} id={sectionAnchor(s.id)} data-section={s.id} className={c.items.length > 1 ? "section-in-chapter" : undefined}>{s.el}</div>)}
          </div>
        );
      })}
    </div>
  );
}
