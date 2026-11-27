import Link from "next/link";

import { ChartFrame } from "@/components/ChartFrame";
import { LineChart } from "@/components/monthly/LineChart";
import { Chapters } from "@/components/Section";
import { Glossed } from "@/components/terms/Glossed";
import type { EdWeek, InsightTest, Meta } from "@/lib/api/types";
import { BED_WAIT_LABEL, CAVEAT } from "@/lib/copy";
import { scatterPoints, trendSentence, trendWindow, weeklyLine } from "@/lib/longRun";
import { findingMeta } from "@/lib/provenance";
import { outcomeOf } from "@/lib/testLedger";
import { formatWindow, HISTORY_WEEKS, TREND_WEEKS } from "@/lib/windows";

import { Scatter, ScatterTable } from "./Scatter";

const hoursText = (v: number) => `${v.toLocaleString("en-SG", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} hours`;
const r2 = (v: number) => v.toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * One hospital over the long run: every complete week since the Ministry of Health's data starts, with the trend test's 26 weeks shaded and its result
 * in words; then the days its visits-and-waits correlation was tested on, when one was published. The numbers are MOH's and the
 * insight engine's; this component lays them out.
 */
export function HospitalLongRun({ code, name, weekly, weeklyMeta, tests, testsMeta }: {
  code: string; name: string; weekly: EdWeek[]; weeklyMeta: Meta; tests: InsightTest[]; testsMeta: Meta | null;
}) {
  const line = weeklyLine(weekly, code);
  if (!line.starts.length) return null;
  const window = trendWindow(line);
  const trend = tests.find((t) => t.type === "trend" && t.entity === code);
  const sentence = trendSentence(trend);
  const link = tests.find((t) => t.type === "volume_vs_wait" && t.entity === code && outcomeOf(t) === "published");
  const points = link ? scatterPoints(link) : [];
  const xLabel = "ED visits that day, against the usual for that weekday";
  const yLabel = `Bed wait ${link?.when ?? ""}, hours against the usual for that weekday`;
  const first = line.starts[0] as string;
  // The title runs to the last week's Sunday, as every other window on the site does.
  const lastStart = line.starts.at(-1) as string;
  const last = weekly.find((w) => w.hospital_code === code && w.week_start === lastStart)?.week_end ?? lastStart;
  return (
    <Chapters first="page">
      <ChartFrame title={`${BED_WAIT_LABEL}, every week, ${formatWindow({ kind: "days", from: first, to: last })}`} slug="every-week"
                  meta={weeklyMeta} caveat={CAVEAT.weeklyAverage} csv={`/export/ed-weekly.csv?hospital=${code}&weeks=${HISTORY_WEEKS}&context=1`}
                  table={{ href: `/export/ed-weekly.csv?hospital=${code}&weeks=${HISTORY_WEEKS}`, label: "Every week as a CSV" }}
                  summary={`${name}'s average of daily median bed waits for every complete week since the Ministry of Health's data starts${window ? `, with the latest ${TREND_WEEKS} weeks shaded` : ""}. A break in the line is a week that isn't complete.`}
                  description={<>
                    <Glossed text={`Each week's average of the daily medians, since MOH's data starts. A break is a week MOH didn't publish in full.${window ? ` The shaded ${TREND_WEEKS} weeks are the ones the trend test looks at.` : ""}`} />
                    {sentence ? <span className="mt-1 block text-ink" data-testid="trend-sentence">{sentence}</span> : null}
                  </>}>
        <LineChart labels={line.labels} titles={line.titles} unit="Hours" testId="every-week" format={hoursText} hover={false}
                   series={[{ key: code, label: "", color: "data-mark", values: line.values, strong: true }]}
                   summary={`Weekly bed waits at ${name}, ${line.starts.length} weeks.`}
                   shade={window ? { ...window, label: `Latest ${TREND_WEEKS} weeks` } : null} />
      </ChartFrame>

      {link && points.length && testsMeta ? (
        <ChartFrame title={`Emergency department visits and the bed wait ${link.when}, the ${points.length} days tested`} slug="visits-and-waits"
                    meta={findingMeta({ ...link, as_of: testsMeta.as_of }, testsMeta)} caveat={CAVEAT.bedWaitUnit} csv={`/export/pairs.csv?type=volume_vs_wait&entity=${code}&context=1`}
                    table={<ScatterTable points={points} xLabel={xLabel} yLabel={yLabel} />}
                    summary={`One dot per day: ${name}'s emergency department visits against its bed wait ${link.when}, each against the usual for that weekday.`}
                    description={<>
                      <Glossed text={`Each dot is a day: its ED visits and the bed wait ${link.when}, both against the usual for that weekday (so the weekly rhythm doesn't make them look linked). Dots up and to the right are days with more visits than usual, followed by longer waits than usual.`} />
                      <span className="mt-1 block text-ink" data-testid="scatter-sentence">
                        {`Spearman correlation ${r2(link.metric_value ?? 0)}${link.ci_low != null && link.ci_high != null ? ` (95% range ${r2(link.ci_low)} to ${r2(link.ci_high)})` : ""}: an association only, which doesn't show why waits move. `}
                        <Link href="/findings#tests">Every test run</Link>
                      </span>
                    </>}>
          <Scatter points={points} xLabel={xLabel} yLabel={yLabel} summary={`${points.length} days of emergency department visits against bed waits ${link.when}.`} />
        </ChartFrame>
      ) : null}
    </Chapters>
  );
}
