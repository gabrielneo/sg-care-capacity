import Link from "next/link";

import { ChartFrame } from "@/components/ChartFrame";
import { Scatter, ScatterTable } from "@/components/edcharts/Scatter";
import { Section } from "@/components/Section";
import { Glossed } from "@/components/terms/Glossed";
import type { InsightTest, Meta } from "@/lib/api/types";
import { scatterPoints } from "@/lib/longRun";
import { findingMeta } from "@/lib/provenance";
import { outcomeOf } from "@/lib/testLedger";

const r2 = (v: number) => v.toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const X = "ED visits, % change on the same month a year before";
const Y = "Average bed wait, % change on the same month a year before";

/**
 * The months the year-on-year test ran on, one dot each, when it was published: the engine's own pairs (GET /api/v1/insights/tests).
 * Otherwise nothing: an unpublished test has no pairs, and the chart of every test on Findings shows its result.
 */
export function YearOnYearScatter({ tests, meta }: { tests: InsightTest[]; meta: Meta }) {
  const test = tests.find((t) => t.type === "monthly_yoy" && outcomeOf(t) === "published");
  const points = test ? scatterPoints(test) : [];
  if (!test || !points.length) return null;
  return (
    <Section tone="page">
      <ChartFrame title={`Emergency department visits and bed waits, year on year: the ${points.length} months tested`} slug="year-on-year-pairs" meta={findingMeta({ ...test, as_of: meta.as_of }, meta)}
                  csv="/export/pairs.csv?type=monthly_yoy&context=1" table={<ScatterTable points={points} xLabel={X} yLabel={Y} />}
                  caveat="Each month's change overlaps with its neighbours' (each is against a year before), so the test allows for runs of similar months."
                  summary={`One dot per month: the change in emergency department visits against the change in the average bed wait, each on the same month a year before, at the full emergency departments together.`}
                  description={<>
                    <Glossed text="Each dot is a month at the full EDs together: how much its ED visits and its average bed wait changed on the same month a year before. Dots up and to the right are months with more visits and longer waits than a year before." />
                    <span className="mt-1 block text-ink" data-testid="yoy-scatter-sentence">
                      {`Spearman correlation ${r2(test.metric_value ?? 0)}${test.ci_low != null && test.ci_high != null ? ` (95% range ${r2(test.ci_low)} to ${r2(test.ci_high)})` : ""}: an association only, which doesn't show why waits move. `}
                      <Link href="/findings#tests">Every test run</Link>
                    </span>
                  </>}>
        <Scatter points={points} xLabel={X} yLabel={Y} digits={0} testId="yoy-scatter" summary={`${points.length} months of year-on-year changes in visits and bed waits.`} />
      </ChartFrame>
    </Section>
  );
}
