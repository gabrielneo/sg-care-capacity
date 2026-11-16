import type { ReactNode } from "react";

import { ChartFrame } from "@/components/ChartFrame";
import { Chapters } from "@/components/Section";
import { Glossed } from "@/components/terms/Glossed";
import type { Meta } from "@/lib/api/types";
import { CAVEAT } from "@/lib/copy";
import { MONTHS, monthsText, type Point, timeSeries, yearLines, yearsSoFar } from "@/lib/monthly";

import { ChangeBars } from "./ChangeBars";
import { LineChart, type LineSeries } from "./LineChart";
import { MonthlyTable } from "./MonthlyTable";
import { YearSoFarTable } from "./YearSoFarTable";

const YEAR_COLORS = ["cat-3", "cat-2", "cat-1"] as const;

/** The month-by-month charts, the same for the whole system and for one hospital: only the points and the words differ. */
export function MonthlyCharts({ points, meta, subject, csv, caveat, findings = null }: {
  points: Point[]; meta: Meta; subject: string; csv: string; caveat: string;
  /** Findings shown above the change bars (the engine's own; nothing is written here). Renders nothing when there are none. */
  findings?: ReactNode;
}) {
  const wait = timeSeries(points, "wait");
  const labels = wait.map((p) => `${p.label.slice(0, 3)} ${p.label.slice(-2)}`);
  const waitYoy = timeSeries(points, "waitYoy");
  const visitsYoy = timeSeries(points, "visitsYoy");
  const sofar = yearsSoFar(points);
  const span = sofar.length ? monthsText(sofar[0]!.months) : "";
  const yearSeries = (measure: "wait" | "visits"): LineSeries[] => {
    const lines = yearLines(points, measure);
    return lines.map((l, i) => ({ key: String(l.year), label: String(l.year), color: YEAR_COLORS[YEAR_COLORS.length - lines.length + i] ?? "cat-3",
                                  values: l.values, strong: i === lines.length - 1 }));
  };
  const years = yearLines(points, "wait").map((l) => l.year);
  return (
    <Chapters first="band">
      <ChartFrame title={`${subject}: average bed wait, month by month`} slug="monthly-wait" meta={meta} caveat={caveat} csv={csv}
                  summary={`A line of ${subject}'s average bed wait for each complete month, in hours. A gap is a month that is partial or has no figure.`}
                  table={<MonthlyTable points={points} caption={`${subject}: bed wait and ED visits by month, with change against a year before and the month before`} />}
                  description={<Glossed text="Each point is a month's average of its daily medians, in hours. A break in the line is a month that is not complete: it is left out, never filled in." />}>
        <LineChart labels={labels} every={6} unit="Hours, average of each day's median"
                   series={[{ key: "wait", label: "Wait", color: "cat-1", values: wait.map((p) => p.value), strong: true }]}
                   summary={`${subject}'s average bed wait by month, in hours, from ${labels[0] ?? "the first month"} to ${labels.at(-1) ?? "the latest"}.`} />
      </ChartFrame>

      <ChartFrame title={`${subject}: the same month, year on year`} slug="monthly-year-on-year" meta={meta} caveat={caveat} csv={csv}
                  summary={`Lines for ${years.join(", ")} on one January to December axis, so each month can be read against the same month in other years.`}
                  table={<YearSoFarTable rows={sofar} />}
                  description={<Glossed text={`Each year is one line, January to December. Months differ through the year, so this compares each month with the same month in other years.${span ? ` The table counts only ${span}, the months complete in every year shown.` : ""}`} />}>
        <LineChart labels={[...MONTHS]} unit="Hours, average of each day's median" series={yearSeries("wait")} testId="year-lines-wait"
                   summary={`Average bed wait by month for ${years.join(", ")}, in hours.`} />
        <div className="mt-6">
          <LineChart labels={[...MONTHS]} unit="ED visits in the month" series={yearSeries("visits")} testId="year-lines-visits"
                     summary={`ED visits by month for ${years.join(", ")}.`} />
        </div>
      </ChartFrame>

      <ChartFrame title={`${subject}: change against the same month a year before`} slug="monthly-change" meta={meta} caveat={caveat} csv={csv}
                  summary="Bars of the percentage change in the average bed wait, and in ED visits, against the same month a year earlier. A month with no complete month a year before has no bar."
                  table="self"
                  description={<Glossed text="Bars above 0 mean a longer wait (or more visits) than a year before. Only months complete in both years are drawn. This describes change; it does not show why." />}>
        {findings}
        <ChangeBars labels={labels} every={6} values={waitYoy.map((p) => p.value)} tone="wait" unit="Bed wait, % change on the same month a year before"
                    summary="Percentage change in the average bed wait against the same month a year before." testId="change-bars-wait" />
        <div className="mt-6">
          <ChangeBars labels={labels} every={6} values={visitsYoy.map((p) => p.value)} tone="visits" unit="ED visits, % change on the same month a year before"
                      summary="Percentage change in ED visits against the same month a year before." testId="change-bars-visits" />
        </div>
      </ChartFrame>
    </Chapters>
  );
}

export const MONTHLY_CAVEAT = `${CAVEAT.weeklyAverage} A month counts only when it is complete.`;
