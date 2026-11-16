import { formatValue, metricByKey } from "@/lib/areaMetrics";
import type { AreaStyle, Svy21Feature } from "@/lib/map3d";
import type { LegendClass } from "@/lib/quantiles";
import { staticMap } from "@/lib/staticMap";

const METRIC = metricByKey("cdmp_clinics_per_1k_seniors");

/**
 * The planning areas as one picture, shaded by CDMP clinics per 1,000 residents aged 65+ (darker = fewer). Server-rendered SVG: no
 * script, no map tiles. Shade is never the only cue: every area has a name in its tooltip, an area with no ranking is hatched and
 * said so, the legend gives each group's range, and the full table is one link away (the chart frame's "Show as table").
 */
export function LandingMap({ features, areas, classes, excluded }: {
  features: readonly Svy21Feature[]; areas: readonly AreaStyle[]; classes: readonly LegendClass[]; excluded: number }) {
  const map = staticMap(features, areas);
  if (!map) return null;
  return (
    <div data-testid="landing-map" className="grid items-center gap-x-8 gap-y-4 md:grid-cols-[minmax(0,1fr)_16rem]">
      <svg viewBox={`0 0 ${map.width} ${map.height}`} role="img" className="mx-auto h-auto w-full max-w-xl"
           aria-label={`Singapore's ${map.shapes.length} planning areas, shaded by ${METRIC.label.toLowerCase()}. ${METRIC.darker}`}>
        <defs>
          <pattern id="landing-hatch" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="12" height="12" fill="var(--bg-surface)" />
            <line x1="0" y1="0" x2="0" y2="12" stroke="var(--border-control)" strokeWidth="6" />
          </pattern>
        </defs>
        {map.shapes.map((s) => (
          <path key={s.code} d={s.d} fillRule="evenodd" data-excluded={s.excluded ? "" : undefined}
                fill={s.excluded ? "url(#landing-hatch)" : s.color} stroke="var(--bg-surface)" strokeWidth="1.5">
            {/* One string: React 19 renders a <title> with several children as empty and fails to hydrate it. */}
            <title>{`${s.name}${s.excluded ? ": not ranked" : ""}`}</title>
          </path>
        ))}
      </svg>
      <div className="text-meta text-ink" data-testid="landing-legend">
        <p className="font-semibold">Clinics per 1,000 residents aged 65+</p>
        <p className="mt-1 text-muted"><span aria-hidden="true">▼ </span>Darker means fewer.</p>
        <ul className="mt-2 space-y-1">
          {classes.map((c) => (
            <li key={c.index} className="flex items-center gap-2">
              <span aria-hidden="true" className="h-4 w-6 shrink-0 rounded-sm border border-line" style={{ background: c.color }} />
              <span className="tabular-nums">
                {c.min === c.max ? formatValue(c.min, METRIC.decimals) : `${formatValue(c.min, METRIC.decimals)} to ${formatValue(c.max, METRIC.decimals)}`}
              </span>
            </li>
          ))}
          {excluded > 0 ? (
            <li className="flex items-center gap-2">
              <span aria-hidden="true" className="bg-nodata h-4 w-6 shrink-0 rounded-sm border border-line" />
              <span>Not ranked ({excluded})</span>
            </li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}
