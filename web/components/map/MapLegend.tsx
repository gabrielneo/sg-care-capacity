import type { AreaMetric } from "@/lib/areaMetrics";
import { formatValue } from "@/lib/areaMetrics";
import type { LegendClass } from "@/lib/quantiles";

import { ClientGlossed as Glossed } from "../terms/ClientGlossed";

/**
 * Class breaks, the method used, and how many areas have no value: missing data, or a per-senior
 * ratio that is not applicable because no residents aged 65+ live there. Plain HTML, outside the map.
 */
export function MapLegend({ metric, classes, noData, noResidents = 0, smallAreas = 0 }: {
  metric: AreaMetric; classes: LegendClass[]; noData: number; noResidents?: number; smallAreas?: number }) {
  return (
    <div className="text-xs text-ink" data-testid="map-legend">
      <p className="font-semibold"><Glossed text={metric.label} /></p>
      <p className="mt-0.5 text-muted">
        <span aria-hidden="true">▼ </span><Glossed text={metric.darker} />{" "}
        The map is shaded in <strong className="font-medium text-ink">five groups with equal numbers of areas</strong>
        {classes.length < 5 ? " (fewer when areas share a value)" : ""}. Areas with no value are left out of the groups.
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
        {noResidents > 0 ? (
          <li className="flex items-center gap-2" data-testid="legend-no-residents">
            <span aria-hidden="true" className="bg-nodata h-4 w-6 rounded-sm border border-line" />
            <span>Not applicable: no residents aged 65+</span>{" "}
            <span className="text-muted">({noResidents} {noResidents === 1 ? "area" : "areas"})</span>
          </li>
        ) : null}
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="bg-nodata h-4 w-6 rounded-sm border border-line" />
          <span>No data</span>{" "}
          <span className="text-muted">({noData} {noData === 1 ? "area" : "areas"})</span>
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
