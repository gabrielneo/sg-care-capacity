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
  const range = (c: LegendClass) =>
    c.min === c.max ? formatValue(c.min, METRIC.decimals) : `${formatValue(c.min, METRIC.decimals)} to ${formatValue(c.max, METRIC.decimals)}`;
  return (
    <div data-testid="landing-map" className="grid items-center gap-x-8 gap-y-6 md:grid-cols-[minmax(0,1fr)_15rem]">
      <svg viewBox={`0 0 ${map.width} ${map.height}`} role="img" className="landing-map mx-auto h-auto w-full max-w-xl"
           aria-label={`Singapore's ${map.shapes.length} planning areas, shaded by ${METRIC.label.toLowerCase()}. ${METRIC.darker}`}>
        <defs>
          {/* Not ranked: thin lines on the card colour, so it reads as empty in both themes and never as a colour class (nor as "darker"). */}
          <pattern id="landing-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="8" height="8" fill="var(--bg-surface)" />
            <line x1="0" y1="0" x2="0" y2="8" stroke="var(--border-control)" strokeWidth="1.25" strokeOpacity="0.6" />
          </pattern>
        </defs>
        {map.shapes.map((s) => (
          <path key={s.code} d={s.d} fillRule="evenodd" data-excluded={s.excluded ? "" : undefined}
                fill={s.excluded ? "url(#landing-hatch)" : s.color} stroke={s.excluded ? "var(--border-subtle)" : "var(--bg-surface)"}
                strokeWidth="1" strokeLinejoin="round">
            {/* One string: React 19 renders a <title> with several children as empty and fails to hydrate it. */}
            <title>{`${s.name}${s.excluded ? ": not ranked" : ""}`}</title>
          </path>
        ))}
      </svg>
      <div className="text-meta text-ink" data-testid="landing-legend">
        <p className="font-semibold">Clinics per 1,000 residents aged 65+</p>
        <p className="mt-1 text-muted"><span aria-hidden="true">▼ </span>Darker means fewer.</p>
        {/* The classes as one stepped bar, lightest (most) at the top, each step with its range. */}
        <ul className="mt-3">
          {[...classes].reverse().map((c, i, all) => (
            <li key={c.index} className="flex items-center gap-3">
              <span aria-hidden="true" className={`h-6 w-6 shrink-0 ${i === 0 ? "rounded-t-sm" : ""} ${i === all.length - 1 ? "rounded-b-sm" : ""}`}
                    style={{ background: c.color }} />
              <span className="tabular-nums">{range(c)}</span>
            </li>
          ))}
        </ul>
        {excluded > 0 ? (
          <p className="mt-3 flex items-center gap-3">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6 shrink-0 rounded-sm border border-line">
              <rect width="24" height="24" fill="url(#landing-hatch)" />
            </svg>
            <span>Not ranked ({excluded})</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
