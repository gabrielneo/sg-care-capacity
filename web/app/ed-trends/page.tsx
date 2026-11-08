import type { Metadata } from "next";
import Link from "next/link";

import { CaveatChip } from "@/components/CaveatChip";
import { ChartCard } from "@/components/ChartCard";
import { Dumbbell } from "@/components/edcharts/Dumbbell";
import { ModeToggle } from "@/components/edcharts/ModeToggle";
import { type Panel, SmallMultiples } from "@/components/edcharts/SmallMultiples";
import { SlopeChart } from "@/components/edcharts/SlopeChart";
import { WeekdayHeatmap } from "@/components/edcharts/WeekdayHeatmap";
import { EdFilterForm } from "@/components/EdFilterForm";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState, ErrorState } from "@/components/States";
import { Glossed } from "@/components/terms/Glossed";
import { Term } from "@/components/terms/Term";
import { api, settle } from "@/lib/api/client";
import type { Meta } from "@/lib/api/types";
import { BED_WAIT_EXPLAINER, BED_WAIT_LABEL, CAVEAT, dayText, plainError } from "@/lib/copy";
import {
  band,
  findingFor,
  fullEds,
  hospitalSeries,
  latestCompleteWeek,
  parseMode,
  type Profile,
  profileWindow,
  slopePairs,
  usualLevels,
  weekdayProfile,
} from "@/lib/edCompare";
import { parseEdFilters } from "@/lib/edParams";
import { eachDay, missingDays } from "@/lib/series";
import { formatWeek } from "@/lib/weeks";

export const metadata: Metadata = { title: "ED Trends" };
export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | string[] | undefined>>;

const INTRO = "Daily figures from MOH for each public ED: the time waiting for a ward bed after the decision to admit. Each hospital is compared with itself first, then with the others.";
const TITLE = <><Term id="ed" /> trends</>;

export default async function EdTrendsPage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams;
  const hospitalsRes = await settle(api.hospitals());
  if (!hospitalsRes.ok) {
    return (
      <>
        <PageHeader title={TITLE} intro={<Glossed text={INTRO} />} />
        <ErrorState error={plainError(hospitalsRes.error)} />
      </>
    );
  }
  const hospitals = hospitalsRes.value.data;
  const codes = hospitals.map((h) => h.hospital_code);
  const filters = parseEdFilters(params, codes);
  const mode = parseMode(params.mode);
  const [dailyRes, weeklyRes, liveRes, insightsRes] = await Promise.all([
    settle(api.edDaily({ from: filters.from ?? undefined, to: filters.to ?? undefined })),
    settle(api.edWeekly({ weeks: 10 })),
    settle(api.liveNuhsLatest()),
    settle(api.insights()),
  ]);
  const selected = filters.hospitals.length ? filters.hospitals : codes;
  const chosen = hospitals.filter((h) => selected.includes(h.hospital_code));

  const header = (from: string, to: string) => (
    <>
      <PageHeader title={TITLE} intro={<Glossed text={INTRO} />} />
      <EdFilterForm hospitals={hospitals} selected={filters.hospitals} from={from} to={to} />
      {filters.notes.map((n) => (
        <p key={n} className="mb-3">
          <CaveatChip tone="warning">{n}</CaveatChip>
        </p>
      ))}
      <ModeToggle mode={mode} params={params} />
    </>
  );

  if (!dailyRes.ok) {
    return (
      <>
        {header(filters.from ?? "", filters.to ?? "")}
        <ErrorState title="These dates can't be shown" error={plainError(dailyRes.error)} action={<Link href="/ed-trends">Show the default range</Link>} />
      </>
    );
  }
  const { data: daily, meta } = dailyRes.value;
  const coverage = (meta.coverage ?? {}) as { from?: string; to?: string };
  const from = coverage.from ?? filters.from ?? "";
  const to = coverage.to ?? filters.to ?? "";
  if (!daily.some((r) => selected.includes(r.hospital_code))) {
    return (
      <>
        {header(from, to)}
        <EmptyState title={<Glossed text="No MOH figures for this selection" />}
                    message={<Glossed text={`MOH published nothing for ${chosen.map((h) => h.hospital_code).join(", ")} between ${from ? dayText(from) : "?"} and ${to ? dayText(to) : "?"}. Try other hospitals or dates.`} />} />
      </>
    );
  }

  // The usual level and the latest complete week, as the insight engine defines them.
  const weekly = weeklyRes.ok ? weeklyRes.value.data : [];
  const latest = latestCompleteWeek(weekly);
  const usuals = usualLevels(weekly, codes, latest);
  const latestText = latest ? formatWeek({ week_start: latest, week_end: profileWindow(latest).to }) : "the latest complete week";
  const findings = insightsRes.ok ? insightsRes.value.data : [];

  // 1. Small multiples over the chosen range.
  const days = eachDay(from, to);
  const bandPoints = band(daily, fullEds(hospitals), days, mode, usuals);
  const panels: Panel[] = chosen.map((h) => {
    const u = usuals[h.hospital_code];
    const missingUsual = mode === "usual" && u?.usual == null
      ? `No usual level: ${u?.weeks ?? 0} of the 8 weeks before ${latestText} are complete.` : null;
    return { hospital: h, series: hospitalSeries(daily, h.hospital_code, days, mode, u?.usual ?? null), missingUsual };
  });
  const gaps = missingDays(days.map((date) => Object.fromEntries([["date", date], ...chosen.map((h) => [h.hospital_code,
    daily.find((r) => r.hospital_code === h.hospital_code && r.report_date === date)?.median_wait_hours ?? null])])), selected);
  const gapText = Object.entries(gaps).filter(([, n]) => n > 0).map(([c, n]) => `${c} ${n}`).join(", ");

  // 3. Weekday profiles over the 26 complete weeks to the latest (the peak-day finding's window).
  const window = latest ? profileWindow(latest) : null;
  const profileRes = window ? await settle(api.edDaily({ from: window.from, to: window.to })) : null;
  const profiles = profileRes?.ok && window
    ? chosen.map((h) => weekdayProfile(profileRes.value.data, h.hospital_code, window.from, window.to, mode)).filter((p): p is Profile => p != null)
    : [];

  // 4. NUHS vs MOH.
  const pairs = liveRes.ok ? slopePairs(daily, liveRes.value.data).filter((p) => selected.includes(p.code)) : [];
  const slopeMeta: Meta | null = liveRes.ok ? { ...liveRes.value.meta, as_of: meta.as_of,
    sources: [...liveRes.value.meta.sources, ...meta.sources.filter((s) => s.id === "moh_bed_waits")] } : null;

  const range = `${dayText(from)} to ${dayText(to)}`;
  const csv = (path: string, extra: Record<string, string> = {}) => {
    const q = new URLSearchParams();
    for (const h of filters.hospitals) q.append("hospital", h);
    for (const [k, v] of Object.entries(extra)) q.set(k, v);
    return `${path}${q.size ? `?${q}` : ""}`;
  };
  const usualDef = `The usual level is the median of the 8 complete weeks before ${latestText}.`;

  return (
    <>
      {header(from, to)}
      <div className="space-y-6">
        <ChartCard title={BED_WAIT_LABEL} meta={meta} caveat={CAVEAT.bedWaitUnit} download={csv("/export/ed-daily.csv", { from, to })}
                   description={<>
                     <Glossed text={mode === "usual"
                       ? `Each hospital's daily median, in hours above or below its own usual level, ${range}. ${usualDef}`
                       : `Each hospital's daily median, hours, ${range}, all on the same scale.`} />
                     <span className="mt-1 block text-ink" data-testid="bed-wait-explainer"><Glossed text={BED_WAIT_EXPLAINER} /></span>
                     <span className="mt-1 block"><Glossed text="The shaded band is the middle half of the 8 full EDs each day, with their median dashed. Alexandra Hospital's UCC is left out of the band. A break in a line is a day MOH didn't publish." /></span>
                   </>}>
          <SmallMultiples panels={panels} bandPoints={bandPoints} mode={mode} finding={findingFor(findings, "trend")} />
          <p className="mt-2 text-xs text-muted" data-testid="gap-summary">
            {gapText ? <Glossed text={`Days with no figure in this range: ${gapText}.`} /> : "Every day in this range has a figure for each hospital shown."}
          </p>
        </ChartCard>

        {weeklyRes.ok ? (
          <ChartCard title="The latest week against the usual level" slug="latest-vs-usual" meta={weeklyRes.value.meta} caveat={CAVEAT.weeklyAverage}
                     download="/export/ed-weekly.csv?weeks=10"
                     description={<Glossed text={`${latestText} for each hospital, against its usual level. ${usualDef} Largest difference first.`} />}>
            <Dumbbell usuals={usuals} hospitals={chosen} mode={mode} finding={findingFor(findings, "anomaly")} />
          </ChartCard>
        ) : <ErrorState title="The weekly figures can't be shown" error={plainError(weeklyRes.error)} />}

        {profileRes?.ok && window ? (
          <ChartCard title="Bed wait by day of the week" slug="weekday" meta={profileRes.value.meta} caveat={CAVEAT.weeklyAverage}
                     download={csv("/export/ed-daily.csv", { from: window.from, to: window.to })}
                     description={<Glossed text={`${mode === "usual" ? "Each weekday against the hospital's own average" : "The average bed wait on each weekday"}, over the complete weeks from ${dayText(window.from)} to ${dayText(window.to)} (up to 26).`} />}>
            <WeekdayHeatmap profiles={profiles} hospitals={hospitals} mode={mode} finding={findingFor(findings, "weekday")} />
          </ChartCard>
        ) : null}

        {slopeMeta ? (
          <ChartCard title={<Glossed text="NUHS estimate and MOH figure" />} slug="nuhs-vs-moh" meta={slopeMeta} cadence="weekly"
                     description={<Glossed text="For each NUHS site: MOH's latest daily median beside NUHS's latest estimate of the bed wait. This chart shows values only; the comparison toggle doesn't apply." />}>
            <SlopeChart pairs={pairs} finding={findingFor(findings, "source_gap")} />
          </ChartCard>
        ) : null}
      </div>
    </>
  );
}
