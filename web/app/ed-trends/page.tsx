import type { Metadata } from "next";
import Link from "next/link";

import { ChartCard } from "@/components/ChartCard";
import { DailyWaitChart } from "@/components/charts/DailyWaitChart";
import { DayOfWeekChart } from "@/components/charts/DayOfWeekChart";
import { WaitAttendanceScatter } from "@/components/charts/WaitAttendanceScatter";
import { EdFilterForm } from "@/components/EdFilterForm";
import { PageHeader } from "@/components/PageHeader";
import { CaveatChip } from "@/components/CaveatChip";
import { Glossed } from "@/components/terms/Glossed";
import { Term } from "@/components/terms/Term";
import { EmptyState, ErrorState } from "@/components/States";
import { api, settle } from "@/lib/api/client";
import { BED_WAIT_EXPLAINER, BED_WAIT_LABEL, BED_WAIT_UNIT_DAILY, CAVEAT, dayText, plainError } from "@/lib/copy";
import { parseEdFilters } from "@/lib/edParams";
import { hospitalKey } from "@/lib/hospitalNotes";
import { seriesStyles } from "@/lib/hospitalStyle";
import { dailyWide, dayOfWeek, missingDays, scatterPoints } from "@/lib/series";

export const metadata: Metadata = { title: "ED Trends" };
export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | string[] | undefined>>;

const INTRO = "Daily figures from MOH for each public ED: the time waiting for a ward bed after the decision to admit, and the number of ED visits.";
const TITLE = <><Term id="ed" /> trends</>;

export default async function EdTrendsPage({ searchParams }: { searchParams: Search }) {
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
  const filters = parseEdFilters(await searchParams, codes);
  const dailyRes = await settle(api.edDaily({ from: filters.from ?? undefined, to: filters.to ?? undefined }));
  const selected = filters.hospitals.length ? filters.hospitals : codes;
  const chosen = hospitals.filter((h) => selected.includes(h.hospital_code));
  const key = hospitalKey(chosen);

  const header = (from: string, to: string) => (
    <>
      <PageHeader title={TITLE} intro={<Glossed text={INTRO} />} />
      <EdFilterForm hospitals={hospitals} selected={filters.hospitals} from={from} to={to} />
      {filters.notes.map((n) => (
        <p key={n} className="mb-3">
          <CaveatChip tone="warning">{n}</CaveatChip>
        </p>
      ))}
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
  const { data, meta } = dailyRes.value;
  const coverage = (meta.coverage ?? {}) as { from?: string; to?: string };
  const from = coverage.from ?? filters.from ?? "";
  const to = coverage.to ?? filters.to ?? "";
  const rows = data.filter((r) => selected.includes(r.hospital_code));
  const styles = seriesStyles(codes);
  const series = chosen.map((h) => ({ code: h.hospital_code, name: h.hospital_name.replace(/\s*\(UCC\)$/, ""),
                                      style: styles[h.hospital_code]! }));

  if (rows.length === 0) {
    return (
      <>
        {header(from, to)}
        <EmptyState title={<Glossed text="No MOH figures for this selection" />}
                    message={<Glossed text={`MOH published nothing for ${chosen.map((h) => h.hospital_code).join(", ")} between ${from ? dayText(from) : "?"} and ${to ? dayText(to) : "?"}. Try other hospitals or dates.`} />} />
      </>
    );
  }

  const wide = dailyWide(rows, selected, from, to);
  const gaps = missingDays(wide, selected);
  const gapText = Object.entries(gaps).filter(([, n]) => n > 0).map(([c, n]) => `${c} ${n}`).join(", ");
  const scatter = scatterPoints(rows, selected);
  const description = (text: string, explainer = false) => (
    <>
      <Glossed text={text} />
      {explainer ? <span className="mt-1 block text-ink" data-testid="bed-wait-explainer"><Glossed text={BED_WAIT_EXPLAINER} /></span> : null}
      {key.length ? <span className="mt-1 block font-medium text-ink"><Glossed text={`${key.join("; ")}.`} /></span> : null}
    </>
  );
  const range = `${dayText(from)} to ${dayText(to)}`;

  return (
    <>
      {header(from, to)}
      <div className="space-y-6">
        <ChartCard title={BED_WAIT_LABEL} meta={meta} caveat={CAVEAT.bedWaitUnit}
                   description={description(`${BED_WAIT_UNIT_DAILY[0]!.toUpperCase()}${BED_WAIT_UNIT_DAILY.slice(1)}, ${range}. A break in a line is a day MOH didn't publish: we never fill in missing days.`, true)}>
          <DailyWaitChart data={wide} series={series} />
          <p className="mt-2 text-xs text-muted" data-testid="gap-summary">
            {gapText ? <Glossed text={`Days with no figure in this range: ${gapText}.`} /> : "Every day in this range has a figure for each hospital shown."}
          </p>
        </ChartCard>

        <ChartCard title="Bed wait by day of the week" meta={meta} caveat={CAVEAT.weeklyAverage}
                   description={description(`${BED_WAIT_LABEL}: the average of each day's median for each weekday, ${range}. Hover or tap to see how many days each average uses.`)}>
          <DayOfWeekChart data={dayOfWeek(rows, selected)} series={series} />
        </ChartCard>

        <ChartCard title="Bed wait and ED visits on the same day" meta={meta} caveat={CAVEAT.edVisits}
                   description={description("Each point is one hospital on one day. A busier day does not always come with a longer bed wait.")}>
          <WaitAttendanceScatter points={scatter.points} series={series} />
          {scatter.excluded ? (
            <p className="mt-2 text-xs text-muted">{scatter.excluded} days with only one of the two figures are left out.</p>
          ) : null}
        </ChartCard>
      </div>
    </>
  );
}
