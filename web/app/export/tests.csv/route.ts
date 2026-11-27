/**
 * Every result the insight engine weighed in this data release, published or not, with why: the figures behind the Findings page's
 * chart of every test.
 */
import { api, settle } from "@/lib/api/client";
import { exportError, tableResponse } from "@/lib/exportRoutes";

export async function GET(request: Request) {
  const res = await settle(api.insightTests());
  if (!res.ok) return exportError(res.error);
  return tableResponse(request, "tests", res.value.meta.snapshot_id,
    ["type", "entity", "when", "n", "n_unit", "metric_value", "unit", "ci_low", "ci_high", "no_difference_at", "effect_size",
     "p_value", "p_adjusted", "outcome"],
    res.value.data.map((t) => [t.type, t.entity, t.when, t.n, t.n_unit, t.metric_value, t.unit, t.ci_low, t.ci_high, t.ci_null,
                               t.effect_size, t.p_value, t.p_adjusted, t.outcome]),
    res.value.meta,
    { title: "Every test and check the insight engine ran, published or not",
      window: "each detector's own window (docs/insights_method.md)",
      definitions: ["ci_low and ci_high are the 95% range of metric_value; no_difference_at is the value that means no difference.",
                    "p_adjusted is corrected across every test in the run (Benjamini-Hochberg). Checks with no test have no p-value."] });
}
