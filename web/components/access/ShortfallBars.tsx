import type { Meta } from "@/lib/api/types";
import type { ShortfallBar } from "@/lib/accessCharts";

import { ChartCard } from "../ChartCard";
import { Glossed } from "../terms/Glossed";

/**
 * The priority areas' shortfall: CDMP GP clinics the national rate would give each area's seniors,
 * minus the clinics it has. Bars are plain HTML (a list), so they read in order without a chart.
 */
export function ShortfallBars({ bars, meta, top }: { bars: ShortfallBar[]; meta: Meta; top: string | null }) {
  const max = Math.max(1, ...bars.map((b) => b.shortfall));
  return (
    <ChartCard title="Clinics short of the national rate" slug="shortfall" meta={meta} headingLevel={3} download="/export/areas.csv"
               description={<Glossed text={`The ${bars.length} priority areas from this week's findings: CDMP GP clinics the national rate would give their residents aged 65+, minus the clinics they have. Largest first.`} />}>
      <ol className="space-y-1.5 text-sm" data-testid="shortfall-bars">
        {bars.map((b) => (
          <li key={b.name} className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-2" data-testid="shortfall-bar"
              data-top={b.name === top ? "" : undefined}>
            <span className={`truncate ${b.name === top ? "font-semibold text-ink" : "text-ink"}`} title={b.name}>{b.name}</span>
            <span className="h-3 rounded-sm bg-page" aria-hidden="true">
              <span className={`block h-3 rounded-sm ${b.name === top ? "bg-accent" : "bg-muted/50"}`}
                    style={{ width: `${Math.max(2, (100 * b.shortfall) / max)}%` }} />
            </span>
            <span className="tabular-nums text-muted">about {Math.round(b.shortfall)}</span>
          </li>
        ))}
      </ol>
    </ChartCard>
  );
}
