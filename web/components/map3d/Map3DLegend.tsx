import { formatValue } from "@/lib/areaMetrics";
import { heightSteps, SENIORS_PER_STEP } from "@/lib/map3d";
import type { LegendClass } from "@/lib/quantiles";

import { ClientGlossed as Glossed } from "../terms/ClientGlossed";

/** The 3D map's legend: the height scale, the colour groups (darker = fewer clinics) and the flat grey areas. */
export function Map3DLegend({ classes, excluded, maxSeniors }: { classes: LegendClass[]; excluded: number; maxSeniors: number }) {
  const steps = heightSteps(maxSeniors);
  return (
    <div className="text-xs text-ink" data-testid="map3d-legend">
      <p className="font-semibold">Height</p>
      <p className="mt-0.5 text-muted" data-testid="height-scale">
        Height: {SENIORS_PER_STEP.toLocaleString("en-SG")} residents aged 65+ per step. The tallest area has{" "}
        {maxSeniors.toLocaleString("en-SG")}.
      </p>
      <div className="mt-1 flex items-end gap-0.5" aria-hidden="true">
        {Array.from({ length: steps }, (_, i) => (
          <span key={i} className="w-3 rounded-t-sm bg-line" style={{ height: `${(i + 1) * 5}px` }} />
        ))}
      </div>
      <p className="mt-3 font-semibold"><Glossed text="Colour: CDMP GP clinics per 1,000 residents aged 65+" /></p>
      <p className="mt-0.5 text-muted">
        <span aria-hidden="true">▼ </span>Darker means fewer chronic-care clinics per senior: worse access. Shaded in{" "}
        <strong className="font-medium text-ink">five groups with equal numbers of areas</strong>, among the areas that are ranked.
      </p>
      <ul className="mt-2 space-y-1">
        {classes.map((c) => (
          <li key={c.index} className="flex items-center gap-2">
            <span aria-hidden="true" className="h-4 w-6 rounded-sm border border-line" style={{ background: c.color }} />
            <span className="tabular-nums">
              {c.min === c.max ? formatValue(c.min, 2) : `${formatValue(c.min, 2)} – ${formatValue(c.max, 2)}`} per 1,000 aged 65+
            </span>{" "}
            <span className="text-muted">({c.count} {c.count === 1 ? "area" : "areas"})</span>
          </li>
        ))}
        <li className="flex items-center gap-2" data-testid="legend-excluded">
          <span aria-hidden="true" className="bg-nodata h-4 w-6 rounded-sm border border-line" />
          <span>Flat and grey: fewer than 1,000 residents aged 65+, so not ranked</span>{" "}
          <span className="text-muted">({excluded} {excluded === 1 ? "area" : "areas"})</span>
        </li>
      </ul>
    </div>
  );
}
