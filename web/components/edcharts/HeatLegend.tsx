import type { ColourClass } from "@/lib/edCompare";
import { legendEnds, legendLabels } from "@/lib/heatLegend";

/**
 * The colour key: seven equal swatches with each label BELOW its swatch, and the meaning of the two ends.
 * From 768px it sits in the table's own grid (an empty cell the width of the hospital column, then one cell per
 * weekday), so each swatch lines up under the data columns. Below that it wraps.
 */
export function HeatLegend({ classes, mode }: { classes: ColourClass[]; mode: "usual" | "raw" }) {
  const labels = legendLabels(classes, mode);
  const [low, high] = legendEnds(mode);
  return (
    <div className="mt-4" data-testid="heat-legend" data-min={classes[0]?.min} data-max={classes.at(-1)?.max}>
      <div className="md:flex">
        <div className="hidden w-label shrink-0 md:block" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <ul className="flex flex-wrap gap-x-4 gap-y-3 md:grid md:grid-cols-7" aria-label="Colour key">
            {classes.map((c, i) => (
              <li key={c.color} className="flex flex-col items-start md:items-center" data-testid="heat-legend-class" data-min={c.min} data-max={c.max}>
                <span aria-hidden="true" className="h-legend w-legend rounded-sm border border-control" style={{ background: c.color }} />
                <span className="mt-1 whitespace-nowrap text-meta tabular-nums text-muted">{labels[i]}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 flex justify-between gap-4 text-meta font-semibold text-ink" aria-hidden="true">
            <span>← {low}</span><span>{high} →</span>
          </p>
        </div>
      </div>
    </div>
  );
}
