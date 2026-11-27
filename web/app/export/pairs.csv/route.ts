/**
 * The pairs a published correlation was tested on (the scatter plots): ?type=volume_vs_wait&entity=SGH, or ?type=monthly_yoy.
 * Every value is the insight engine's, from GET /api/v1/insights/tests.
 */
import { api, settle } from "@/lib/api/client";
import { exportError, tableResponse } from "@/lib/exportRoutes";
import { scatterPoints } from "@/lib/longRun";
import { outcomeOf } from "@/lib/testLedger";

const TYPES = { volume_vs_wait: ["ed_visits_vs_weekday_usual", "bed_wait_hours_vs_weekday_usual"],
                monthly_yoy: ["visits_change_pct_on_a_year_before", "bed_wait_change_pct_on_a_year_before"] } as const;

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const type = q.get("type") === "monthly_yoy" ? "monthly_yoy" : "volume_vs_wait";
  const entity = (q.get("entity") ?? (type === "monthly_yoy" ? "All hospitals" : "")).toUpperCase();
  const res = await settle(api.insightTests({ type }));
  if (!res.ok) return exportError(res.error);
  const test = res.value.data.find((t) => t.entity.toUpperCase() === entity && outcomeOf(t) === "published");
  const points = test ? scatterPoints(test) : [];
  return tableResponse(request, `pairs-${type}-${entity.toLowerCase().replace(/\s+/g, "-") || "none"}`, res.value.meta.snapshot_id,
    ["date", ...TYPES[type]], points.map((p) => [p.date, p.x, p.y]), res.value.meta,
    { title: type === "monthly_yoy" ? "Months tested for visits and bed waits, year on year" : `Days tested for ED visits and bed waits, ${entity}`,
      window: test?.when ? `bed wait ${test.when}` : "the test's own window (docs/insights_method.md)",
      definitions: ["The pairs the published correlation was tested on, as the insight engine wrote them.",
                    type === "monthly_yoy" ? "Each value is a % change on the same month a year before."
                      : "Each value is the day's figure minus that hospital's median for the same weekday, over the test's 26 weeks."] });
}
