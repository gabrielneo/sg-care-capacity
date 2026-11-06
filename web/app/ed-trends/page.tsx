import type { Metadata } from "next";
import Link from "next/link";

import { ChartCard } from "@/components/ChartCard";
import { DailyWaitChart } from "@/components/charts/DailyWaitChart";
import { DayOfWeekChart } from "@/components/charts/DayOfWeekChart";
import { WaitAttendanceScatter } from "@/components/charts/WaitAttendanceScatter";
import { EdFilterForm } from "@/components/EdFilterForm";
import { PageHeader } from "@/components/PageHeader";
import { CaveatChip } from "@/components/CaveatChip";
import { EmptyState, ErrorState } from "@/components/States";
import { api, settle } from "@/lib/api/client";
import { parseEdFilters } from "@/lib/edParams";
import { hospitalKey } from "@/lib/hospitalNotes";
import { seriesStyles } from "@/lib/hospitalStyle";
import { dailyWide, dayOfWeek, missingDays, scatterPoints } from "@/lib/series";

export const metadata: Metadata = { title: "ED Trends" };
export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | string[] | undefined>>;

const INTRO = "Daily figures MOH publishes for each public emergency department: the median wait for a ward bed and the number of attendances.";

export default async function EdTrendsPage({ searchParams }: { searchParams: Search }) {
  const hospitalsRes = await settle(api.hospitals());
  if (!hospitalsRes.ok) {
    return (
      <>
        <PageHeader title="ED Trends" intro={INTRO} />
        <ErrorState error={hospitalsRes.error} />
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
      <PageHeader title="ED Trends" intro={INTRO} />
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
        <ErrorState title="These dates can't be shown" error={dailyRes.error} action={<Link href="/ed-trends">Show the default range</Link>} />
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
        <EmptyState title="No MOH figures for this selection"
                    message={`MOH published nothing for ${chosen.map((h) => h.hospital_code).join(", ")} between ${from} and ${to}. Try other hospitals or dates.`} />
      </>
    );
  }

  const wide = dailyWide(rows, selected, from, to);
  const gaps = missingDays(wide, selected);
  const gapText = Object.entries(gaps).filter(([, n]) => n > 0).map(([c, n]) => `${c} ${n}`).join(", ");
  const scatter = scatterPoints(rows, selected);
  const description = (text: string) => (
    <>
      {text}
      {key.length ? <span className="mt-1 block font-medium text-ink">{key.join("; ")}.</span> : null}
    </>
  );

  return (
    <>
      {header(from, to)}
      <div className="space-y-6">
        <ChartCard title="Daily median wait for a ward bed" meta={meta}
                   caveat={meta.caveats.find((c) => c.startsWith("Median wait")) ?? null}
                   description={description(`From the decision to admit to leaving the ED, for patients admitted that day; ${from} to ${to}. A break in a line is a day MOH didn't publish.`)}>
          <DailyWaitChart data={wide} series={series} />
          <p className="mt-2 text-xs text-muted" data-testid="gap-summary">
            {gapText ? `Days with no figure in this range: ${gapText}.` : "Every day in this range has a figure for each hospital shown."}
          </p>
        </ChartCard>

        <ChartCard title="Day-of-week pattern" meta={meta} caveat={null}
                   description={description("Average of the daily median waits on each weekday, over the same days. Hover for how many days each average uses.")}>
          <DayOfWeekChart data={dayOfWeek(rows, selected)} series={series} />
        </ChartCard>

        <ChartCard title="Wait vs attendances" meta={meta}
                   caveat={meta.caveats.find((c) => c.startsWith("Emergency department attendances")) ?? null}
                   description={description("Each point is one hospital on one day. Busier days don't always mean longer waits: bed waits depend on ward capacity too.")}>
          <WaitAttendanceScatter points={scatter.points} series={series} />
          {scatter.excluded ? (
            <p className="mt-2 text-xs text-muted">{scatter.excluded} days with only one of the two figures are left out.</p>
          ) : null}
        </ChartCard>
      </div>
    </>
  );
}
