import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ChartFrame } from "@/components/ChartFrame";
import { Dumbbell } from "@/components/edcharts/Dumbbell";
import { UsualTable } from "@/components/edcharts/UsualTable";
import { LandingMap } from "@/components/landing/LandingMap";
import { NOTICE_995_LINE } from "@/components/Notice995";
import { ErrorState } from "@/components/States";
import { api, settle } from "@/lib/api/client";
import { CAVEAT, plainError } from "@/lib/copy";
import { latestCompleteWeek, profileWindow, usualLevels } from "@/lib/edCompare";
import { edPreview } from "@/lib/explore";
import { FIND_PATH } from "@/lib/homeViews";
import { systemFindings } from "@/lib/hospitals";
import { styleAreas } from "@/lib/map3d";
import { SITE_TITLE } from "@/lib/site";
import { SPARK_WEEKS } from "@/lib/status";
import { buildStrip } from "@/lib/strip";
import { USUAL_WEEKS, formatWindow } from "@/lib/windows";

export const metadata: Metadata = { title: { absolute: SITE_TITLE } };
export const dynamic = "force-dynamic"; // rendered per request; API responses are cached for an hour

type Search = Promise<Record<string, string | string[] | undefined>>;

/** What the home page's address carried before the landing page: the finder's own parameters. */
const FINDER_PARAMS = ["view", "sort", "cluster", "layout", "hospital"] as const;

/**
 * The landing page: what the site is, in four screens. A short claim, two pictures (bed waits against each hospital's usual, and
 * clinics per senior by area), each with one short note, and the three ways on. Every figure and note is computed from the API
 * (the engine's own headlines, or a count of what is drawn); a picture that can't be drawn is left out, with no stand-in.
 * The clinic finder and the Planner and Analyst views are at /find; an old address with their parameters is sent there.
 */
export default async function LandingPage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams;
  const carried = new URLSearchParams();
  for (const key of FINDER_PARAMS) {
    const v = params[key];
    for (const x of Array.isArray(v) ? v : v != null ? [v] : []) carried.append(key, x);
  }
  if (carried.size) redirect(`${FIND_PATH}?${carried.toString()}`);

  const [hospitalsRes, weeklyRes, liveRes, insightsRes, areasRes, gapRes] = await Promise.all([
    settle(api.hospitals()),
    settle(api.edWeekly({ weeks: SPARK_WEEKS + 1 })),
    settle(api.liveNuhsLatest()),
    settle(api.insights()),
    settle(api.areasAccessSvy21()),
    settle(api.insights({ type: "access_gap", top: 1 })),
  ]);

  // Chart 1: the latest complete week against each hospital's usual level (the same figures as /ed-trends).
  const hospitals = hospitalsRes.ok ? hospitalsRes.value.data : [];
  const weekly = weeklyRes.ok ? weeklyRes.value.data : [];
  const latest = latestCompleteWeek(weekly);
  const usuals = usualLevels(weekly, hospitals.map((h) => h.hospital_code), latest);
  const latestWeek = latest ? { week_start: latest, week_end: profileWindow(latest).to } : null;
  const strip = hospitalsRes.ok && weeklyRes.ok
    ? buildStrip({ hospitals, weekly, weeklyMeta: weeklyRes.value.meta, live: liveRes.ok ? liveRes.value.data : [],
                   liveMeta: liveRes.ok ? liveRes.value.meta : null, now: new Date() })
    : null;
  const count = edPreview(strip, weeklyRes.ok ? weeklyRes.value.meta : null);
  const insights = insightsRes.ok ? insightsRes.value.data : [];
  // A note only if the engine has a finding about this chart (the latest week against usual); a weekday finding is for another chart.
  const finding = systemFindings(insights, hospitals).filter((i) => i.type === "anomaly" || i.type === "usual_gap")
    .sort((x, y) => (x.headline_rank ?? 99) - (y.headline_rank ?? 99))[0] ?? null;
  const waitsMeta = weeklyRes.ok ? weeklyRes.value.meta : null;
  const drawBedWaits = waitsMeta != null && hospitalsRes.ok && latest != null && hospitals.length > 0;

  // Chart 2: clinics for each 1,000 residents aged 65+, by planning area.
  const features = areasRes.ok ? areasRes.value.data.features : [];
  const styled = styleAreas(features);
  const ranked = styled.areas.filter((a) => !a.excluded && a.props.cdmp_clinics_per_1k_seniors != null).length;
  const gap = gapRes.ok ? gapRes.value.data[0] ?? null : null;
  const accessMeta = areasRes.ok ? areasRes.value.meta : null;
  const drawAccess = accessMeta != null && styled.classes.length > 0;

  return (
    <div data-testid="landing">
      <section aria-labelledby="landing-title" data-testid="landing-hero" className="mx-auto max-w-3xl py-8 text-center sm:py-16">
        <h1 id="landing-title" className="text-kpi font-semibold tracking-tight text-ink">
          Emergency waits and clinic access for Singapore&apos;s seniors.
        </h1>
        <p className="mt-4 text-body text-muted">What public data shows, in two pictures.</p>
        <p className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href={FIND_PATH} data-testid="cta-find"
                className="inline-flex min-h-12 items-center rounded-lg bg-accent px-6 text-body font-semibold text-surface no-underline hover:bg-accent-strong">
            Find a clinic near you
          </Link>
          <Link href="/findings" data-testid="cta-findings" className="inline-flex min-h-12 items-center px-4 text-body font-semibold">
            Read the findings
          </Link>
        </p>
        <p className="mt-6 text-meta text-muted" data-testid="not-advice">{NOTICE_995_LINE}</p>
      </section>

      {waitsMeta && drawBedWaits ? (
        <section aria-labelledby="landing-waits" data-testid="landing-waits" className="section section-band">
          <div className="mx-auto max-w-3xl text-center">
            <h2 id="landing-waits" className="text-h2 font-semibold text-ink">Bed waits, against each hospital&apos;s usual.</h2>
            {count ? <p className="mt-3 text-body font-semibold text-ink" data-testid="landing-count">{count.figure}.</p> : null}
            {finding ? <p className="mt-1 text-small text-muted" data-testid="landing-insight">{finding.headline}</p> : null}
          </div>
          <div className="mt-8">
            <ChartFrame title="Time waiting for a ward bed after the decision to admit, latest complete week against usual" slug="landing-waits" titleHidden headingLevel={3}
                        meta={waitsMeta} caveat={CAVEAT.weeklyAverage}
                        csv="/export/ed-weekly.csv?weeks=10&context=1" table={<UsualTable usuals={usuals} hospitals={hospitals} />}
                        summary={`For each hospital, the ${formatWindow({ kind: "latest_week", week: latestWeek })} as hours against its usual level, the median of the ${USUAL_WEEKS} complete weeks before it, largest difference first.`}>
              <Dumbbell usuals={usuals} hospitals={hospitals} mode="raw" finding={null} />
            </ChartFrame>
          </div>
        </section>
      ) : null}

      {!drawBedWaits && !(hospitalsRes.ok && weeklyRes.ok) ? (
        <section aria-labelledby="landing-waits" data-testid="landing-waits-error" className="section section-band">
          <h2 id="landing-waits" className="text-h2 font-semibold text-ink">Bed waits, against each hospital&apos;s usual.</h2>
          <div className="mt-6">
            <ErrorState title="The bed-wait figures can't be shown right now"
                        error={plainError(hospitalsRes.ok ? (weeklyRes as { error: Error }).error : (hospitalsRes as { error: Error }).error)} />
          </div>
        </section>
      ) : null}

      {accessMeta && drawAccess ? (
        <section aria-labelledby="landing-access" data-testid="landing-access" className="section">
          <div className="mx-auto max-w-3xl text-center">
            <h2 id="landing-access" className="text-h2 font-semibold text-ink">Clinics for seniors, by area.</h2>
            <p className="mt-3 text-body font-semibold text-ink" data-testid="landing-access-count">
              {ranked} of {styled.areas.length} planning areas are ranked.
            </p>
            {gap ? <p className="mt-1 text-small text-muted" data-testid="landing-access-insight">{gap.headline}</p> : null}
          </div>
          <div className="mt-8">
            <ChartFrame title="Chronic-care clinics for each 1,000 residents aged 65 and over, by planning area" slug="landing-access" titleHidden headingLevel={3}
                        meta={accessMeta} caveat={CAVEAT.clinics}
                        csv="/export/areas.csv?context=1" table={{ href: "/access-map?view=table" }}
                        summary={`A map of ${styled.areas.length} planning areas shaded by chronic-care clinics for each 1,000 residents aged 65 and over; darker means fewer. ${ranked} are ranked.`}>
              <LandingMap features={features} areas={styled.areas} classes={styled.classes} excluded={styled.excluded} />
            </ChartFrame>
          </div>
        </section>
      ) : null}

      {/* One error block when the data service is down; this one only when the bed waits loaded and the map did not. */}
      {!areasRes.ok && hospitalsRes.ok && weeklyRes.ok ? (
        <section aria-labelledby="landing-access" data-testid="landing-access-error" className="section">
          <h2 id="landing-access" className="text-h2 font-semibold text-ink">Clinics for seniors, by area.</h2>
          <div className="mt-6"><ErrorState title="The clinic map can't be shown right now" error={plainError(areasRes.error)} /></div>
        </section>
      ) : null}

      <section aria-labelledby="landing-more" className="section section-band" data-testid="landing-more">
        <h2 id="landing-more" className="sr-only">Where to go next</h2>
        <ul className="card-grid md:grid-cols-3">
          {[
            { href: "/findings", title: "Findings", text: "What the latest data release shows, and how sure we are." },
            { href: "/explore", title: "Explore the data", text: "Compare hospitals, see clinic access and check live waits." },
            { href: "/methodology", title: "How it is made", text: "Where each number comes from and what it can't tell you." },
          ].map((c) => (
            <li key={c.href} className="rounded-xl border border-line bg-surface card" data-testid="landing-card">
              <Link href={c.href} className="inline-flex min-h-11 items-center text-h3 font-semibold">{c.title}</Link>
              <p className="mt-1 text-small text-muted">{c.text}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
