import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ChartFrame } from "@/components/ChartFrame";
import { Dumbbell } from "@/components/edcharts/Dumbbell";
import { UsualTable } from "@/components/edcharts/UsualTable";
import { LandingMap } from "@/components/landing/LandingMap";
import { CountUp } from "@/components/motion/CountUp";
import { HeroLine } from "@/components/motion/HeroLine";
import { Reveal } from "@/components/motion/Reveal";
import { ScrollProgress } from "@/components/motion/ScrollProgress";
import { NOTICE_995_LINE } from "@/components/Notice995";
import { provenanceText } from "@/components/Provenance";
import { ErrorState } from "@/components/States";
import { api, settle } from "@/lib/api/client";
import { CAVEAT, plainError } from "@/lib/copy";
import { latestCompleteWeek, profileWindow, usualLevels } from "@/lib/edCompare";
import { edPreview } from "@/lib/explore";
import { FIND_PATH } from "@/lib/homeViews";
import { systemFindings } from "@/lib/hospitals";
import { styleAreas } from "@/lib/map3d";
import { fromSystem, latestComplete, MONTHS_LONG, timeSeries } from "@/lib/monthly";
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

  const [hospitalsRes, weeklyRes, liveRes, insightsRes, areasRes, gapRes, monthlyRes] = await Promise.all([
    settle(api.hospitals()),
    settle(api.edWeekly({ weeks: SPARK_WEEKS + 1 })),
    settle(api.liveNuhsLatest()),
    settle(api.insights()),
    settle(api.areasAccessSvy21()),
    settle(api.insights({ type: "access_gap", top: 1 })),
    settle(api.edSystemMonthly({ months: 36 })),
  ]);

  // The hero picture and its three figures: the full EDs, month by month (the same figures as /ed-trends/monthly). Left out, with no stand-in, when a release has none.
  const monthly = monthlyRes.ok ? monthlyRes.value.data.map(fromSystem) : [];
  const newest = latestComplete(monthly);
  const heroLine = timeSeries(monthly, "wait");
  const monthlyMeta = monthlyRes.ok ? monthlyRes.value.meta : null;
  const showHero = monthlyMeta != null && newest != null && heroLine.some((p) => p.value != null);
  const newestName = newest ? `${MONTHS_LONG[newest.month - 1]} ${newest.year}` : "";

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
    <div data-testid="landing" className="overflow-x-clip">
      <ScrollProgress />
      <section aria-labelledby="landing-title" data-testid="landing-hero" className="relative isolate py-8 sm:py-16">
        {/* A slow drift of colour behind the claim: decorative, and still when motion is reduced. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-1/2 -z-10 w-screen -translate-x-1/2">
          <div className="hero-blob" style={{ top: "-30%", left: "-10%", width: "42rem", height: "42rem", background: "radial-gradient(closest-side, color-mix(in srgb, var(--accent) 32%, transparent), transparent)" }} />
          <div className="hero-blob" style={{ top: "-10%", right: "-12%", width: "36rem", height: "36rem", background: "radial-gradient(closest-side, color-mix(in srgb, var(--pop) 26%, transparent), transparent)", animationDirection: "alternate-reverse" }} />
          <div className="hero-blob" style={{ bottom: "-40%", left: "30%", width: "34rem", height: "34rem", background: "radial-gradient(closest-side, color-mix(in srgb, var(--sun) 24%, transparent), transparent)" }} />
        </div>
        <div className={`mx-auto grid items-center gap-x-12 gap-y-8 ${showHero ? "max-w-6xl lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]" : "max-w-3xl"}`}>
          <div className={showHero ? "text-center lg:text-left" : "text-center"}>
            <h1 id="landing-title" className="landing-rise text-kpi font-semibold tracking-tight text-ink">
              Emergency waits and clinic access for <span className="text-gradient">Singapore&apos;s seniors.</span>
            </h1>
            <p className="landing-rise mt-4 text-body text-muted" style={{ ["--delay" as string]: "120ms" }}>What public data shows, in two pictures.</p>
            <p className={`landing-rise mt-8 flex flex-wrap items-center gap-3 ${showHero ? "justify-center lg:justify-start" : "justify-center"}`} style={{ ["--delay" as string]: "240ms" }}>
              <Link href={FIND_PATH} data-testid="cta-find"
                    className="cta-primary inline-flex min-h-12 items-center rounded-lg px-6 text-body font-semibold text-surface no-underline">
                Find a clinic near you
              </Link>
              <Link href="/findings" data-testid="cta-findings" className="inline-flex min-h-12 items-center px-4 text-body font-semibold">
                Read the findings
              </Link>
            </p>
            <p className="landing-rise mt-6 text-meta text-muted" data-testid="not-advice" style={{ ["--delay" as string]: "360ms" }}>{NOTICE_995_LINE}</p>
          </div>
          {showHero ? (
            <div className="landing-rise rounded-xl border border-line bg-surface p-4 shadow-popover sm:p-6" data-testid="hero-card" style={{ ["--delay" as string]: "300ms" }}>
              <p className="text-small font-semibold text-ink">Average bed wait at the full emergency departments, month by month</p>
              <HeroLine points={heroLine} summary={`The average bed wait at the full emergency departments, by month, in hours: ${newestName} was ${newest?.wait?.toFixed(1)} hours.`} />
              <p className="mt-1 flex justify-between text-meta text-muted" data-testid="hero-range">
                <span>{heroLine.find((p) => p.value != null)?.label}</span>
                <span className="font-semibold text-ink">{newestName}: {newest?.wait?.toFixed(1)} hours</span>
              </p>
              <p className="mt-2 text-meta text-muted" data-testid="hero-source">{monthlyMeta ? provenanceText(monthlyMeta) : null}</p>
            </div>
          ) : null}
        </div>
        {showHero ? <p aria-hidden="true" className="hero-cue mt-8 text-center text-muted">↓</p> : null}
      </section>

      {showHero && newest ? (
        <section aria-label={`The latest month, ${newestName}`} data-testid="landing-stats" className="section">
          <Reveal className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-3">
            {[
              { id: "wait", figure: <CountUp value={newest.wait ?? 0} decimals={1} />, unit: "hours", label: `average bed wait, ${newestName}` },
              { id: "visits", figure: <CountUp value={newest.visits ?? 0} />, unit: "", label: `emergency department visits, ${newestName}` },
              ...(newest.waitYoy != null
                ? [{ id: "yoy", figure: <CountUp value={newest.waitYoy} signed suffix="%" />, unit: "", label: `change in bed wait, against ${MONTHS_LONG[newest.month - 1]} ${newest.year - 1}` }] : []),
            ].map((t) => (
              <p key={t.id} data-testid="landing-stat" className="rounded-xl border border-line bg-surface p-4 text-center">
                <span className="block text-kpi font-semibold tracking-tight text-accent">{t.figure}{t.unit ? <span className="ml-1 text-small font-normal text-muted">{t.unit}</span> : null}</span>
                <span className="mt-1 block text-small text-muted">{t.label}</span>
              </p>
            ))}
          </Reveal>
          <p className="mt-3 text-center text-meta text-muted">{monthlyMeta ? provenanceText(monthlyMeta) : null}</p>
        </section>
      ) : null}

      {waitsMeta && drawBedWaits ? (
        <section aria-labelledby="landing-waits" data-testid="landing-waits" className="section section-band">
          <Reveal className="mx-auto max-w-3xl text-center">
            <h2 id="landing-waits" className="text-h2 font-semibold text-ink">Bed waits, against each hospital&apos;s usual.</h2>
            {count ? <p className="mt-3 text-body font-semibold text-ink" data-testid="landing-count">{count.figure}.</p> : null}
            {finding ? <p className="mt-1 text-small text-muted" data-testid="landing-insight">{finding.headline}</p> : null}
          </Reveal>
          <Reveal className="mt-8" delay={120}>
            <ChartFrame title="Time waiting for a ward bed after the decision to admit, latest complete week against usual" slug="landing-waits" titleHidden headingLevel={3}
                        meta={waitsMeta} caveat={CAVEAT.weeklyAverage}
                        csv="/export/ed-weekly.csv?weeks=10&context=1" table={<UsualTable usuals={usuals} hospitals={hospitals} />}
                        summary={`For each hospital, the ${formatWindow({ kind: "latest_week", week: latestWeek })} as hours against its usual level, the median of the ${USUAL_WEEKS} complete weeks before it, largest difference first.`}>
              <Dumbbell usuals={usuals} hospitals={hospitals} mode="raw" finding={null} animate />
            </ChartFrame>
          </Reveal>
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
          <Reveal className="mx-auto max-w-3xl text-center">
            <h2 id="landing-access" className="text-h2 font-semibold text-ink">Clinics for seniors, by area.</h2>
            <p className="mt-3 text-body font-semibold text-ink" data-testid="landing-access-count">
              {ranked} of {styled.areas.length} planning areas are ranked.
            </p>
            {gap ? <p className="mt-1 text-small text-muted" data-testid="landing-access-insight">{gap.headline}</p> : null}
          </Reveal>
          <Reveal className="mt-8" delay={120}>
            <ChartFrame title="Chronic-care clinics for each 1,000 residents aged 65 and over, by planning area" slug="landing-access" titleHidden headingLevel={3}
                        meta={accessMeta} caveat={CAVEAT.clinics}
                        csv="/export/areas.csv?context=1" table={{ href: "/access-map?view=table" }}
                        summary={`A map of ${styled.areas.length} planning areas shaded by chronic-care clinics for each 1,000 residents aged 65 and over; darker means fewer. ${ranked} are ranked.`}>
              <LandingMap features={features} areas={styled.areas} classes={styled.classes} excluded={styled.excluded} />
            </ChartFrame>
          </Reveal>
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
        <Reveal as="ul" className="card-grid md:grid-cols-3">
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
        </Reveal>
      </section>
    </div>
  );
}
