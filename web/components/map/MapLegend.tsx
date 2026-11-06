import type { AreaMetric } from "@/lib/areaMetrics";
import { formatValue } from "@/lib/areaMetrics";
import type { LegendClass } from "@/lib/quantiles";

/** Class breaks, the method used, and how many areas have no data. Plain HTML, outside the map. */
export function MapLegend({ metric, classes, noData, smallAreas = 0 }: {
  metric: AreaMetric; classes: LegendClass[]; noData: number; smallAreas?: number }) {
  return (
    <div className="text-xs text-ink" data-testid="map-legend">
      <p className="font-semibold">{metric.label}</p>
      <p className="mt-0.5 text-muted">
        {metric.higherIsBetter ? "Darker = higher (better access)." : "Darker = farther (worse access)."} Classes are{" "}
        <strong className="font-medium text-ink">quantiles</strong>: each holds about the same number of planning areas, counting
        only areas with a value{classes.length < 5 ? "; tied values merge classes" : ""}.
      </p>
      <ul className="mt-2 space-y-1">
        {classes.map((c) => (
          <li key={c.index} className="flex items-center gap-2">
            <span aria-hidden="true" className="h-4 w-6 rounded-sm border border-line" style={{ background: c.color }} />
            <span className="tabular-nums">
              {c.min === c.max ? formatValue(c.min, metric.decimals) : `${formatValue(c.min, metric.decimals)} – ${formatValue(c.max, metric.decimals)}`}{" "}
              {metric.unit}
            </span>{" "}
            <span className="text-muted">({c.count} {c.count === 1 ? "area" : "areas"})</span>
          </li>
        ))}
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="bg-nodata h-4 w-6 rounded-sm border border-line" />
          <span>No data</span>{" "}
          <span className="text-muted">({noData} {noData === 1 ? "area" : "areas"}, e.g. no residents aged 65+)</span>
        </li>
      </ul>
      {smallAreas > 0 && metric.key.endsWith("per_1k_seniors") ? (
        <p className="mt-2 text-muted">
          {smallAreas} of the areas shown have fewer than 1,000 residents aged 65+, so a clinic or two moves their ratio a lot
          (e.g. 2 clinics for 20 seniors is 100 per 1,000). Their data note says so.
        </p>
      ) : null}
    </div>
  );
}
