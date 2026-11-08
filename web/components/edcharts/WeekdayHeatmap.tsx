import type { Hospital, Insight } from "@/lib/api/types";
import { classFor, type ColourClass, divergingClasses, findingWeekday, type Mode, type Profile, sequentialClasses, textOn } from "@/lib/edCompare";
import { pinnedCaveat } from "@/lib/hospitalNotes";

import { CaveatChip } from "../CaveatChip";
import { Glossed } from "../terms/Glossed";
import { Term } from "../terms/Term";
import { hours, signed } from "./format";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Each hospital's weekday pattern. "vs usual": % above or below its own average, on a diverging,
 * colour-blind-safe scale symmetric about 0 (purple below, near-white at 0, orange above). Raw:
 * hours, darker = longer. A real table, so screen readers get rows and columns; every cell shows
 * its number, so colour never carries the meaning alone.
 */
export function WeekdayHeatmap({ profiles, hospitals, mode, finding }: {
  profiles: Profile[]; hospitals: Hospital[]; mode: Mode; finding: Insight | null }) {
  const byCode = new Map(hospitals.map((h) => [h.hospital_code, h]));
  const values = profiles.flatMap((p) => p.values);
  const classes: ColourClass[] = mode === "raw" ? sequentialClasses(values) : divergingClasses(values);
  const peak = findingWeekday(finding);
  const fmt = (v: number) => (mode === "raw" ? hours(v) : `${signed(v, 0)}%`);
  // Only hospitals that were asked for: the page passes the selected ones (audit L-3).
  const missing = hospitals.filter((h) => !profiles.some((p) => p.code === h.hospital_code));

  return (
    <div>
      {finding?.chart && peak != null && profiles.some((p) => p.code === finding.entity) ? (
        <p className="mb-2 text-sm font-medium text-ink" data-testid="chart-callout">
          <span aria-hidden="true">↓ </span><Term id={finding.entity.toLowerCase()} plain />, {finding.chart.callout} (the peak-day finding)
        </p>
      ) : null}
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Weekday pattern by hospital (scrolls sideways)">
        <table className="w-full min-w-[30rem] border-separate border-spacing-0.5 text-xs" data-testid="heatmap">
          <caption className="sr-only">
            {mode === "raw" ? "Average of daily median bed waits for each weekday, hours" : "Each weekday's bed wait, % above or below the hospital's own average"}
          </caption>
          <thead>
            <tr>
              <th scope="col" className="text-left font-medium text-muted">Hospital</th>
              {DAYS.map((d) => <th key={d} scope="col" className="font-medium text-muted">{d}</th>)}
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => {
              const h = byCode.get(p.code);
              const note = h ? pinnedCaveat(h) : null;
              return (
                <tr key={p.code} data-hospital={p.code}>
                  <th scope="row" className="whitespace-nowrap pr-2 text-left font-medium text-ink">
                    <Term id={p.code.toLowerCase()} />
                    {mode === "raw" && note ? <span className="block font-normal" data-testid="pinned-caveat"><CaveatChip><Glossed text={note} /></CaveatChip></span> : null}
                  </th>
                  {p.values.map((v, d) => {
                    const c = v == null ? null : classFor(v, classes);
                    const marked = finding?.entity === p.code && peak === d;
                    return (
                      <td key={d} data-testid="heat-cell" data-value={v == null ? "" : v.toFixed(2)} data-color={c?.color ?? ""}
                          data-annotated={marked ? "" : undefined}
                          className={`h-9 rounded-sm text-center tabular-nums ${marked ? "outline outline-2 outline-offset-1 outline-ink" : ""}`}
                          style={{ background: c?.color ?? "transparent", color: c && textOn(c.color) === "light" ? "#FFFFFF" : "#0F172A" }}>
                        {v == null ? <span className="text-muted">no data</span> : fmt(v)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3" data-testid="heat-legend" data-min={classes[0]?.min} data-max={classes.at(-1)?.max}>
        <ul className="flex flex-wrap gap-1 text-[11px] text-muted" aria-label="Colour key">
          {classes.map((c, i) => (
            <li key={c.color} className="flex flex-col items-center" data-testid="heat-legend-class" data-min={c.min} data-max={c.max}>
              <span aria-hidden="true" className="h-3 w-12 rounded-sm border border-line" style={{ background: c.color }} />
              <span className="tabular-nums">
                {mode === "raw" ? `${hours(c.min)}–${hours(c.max)} h`
                  : i === (classes.length - 1) / 2 ? "0%" : `${signed(c.min, 0)} to ${signed(c.max, 0)}%`}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-1 text-xs text-muted">
          {mode === "raw"
            ? "Darker means a longer wait. Hours, average of each day's median for that weekday."
            : `Centred on 0: purple is shorter than the hospital's own average, orange is longer. The middle class covers ${signed(classes[3]?.min ?? 0, 0)}% to ${signed(classes[3]?.max ?? 0, 0)}%.`}
        </p>
      </div>
      {missing.length ? (
        <p className="mt-1 text-xs text-muted"><Glossed text={`Not shown, with fewer than 4 complete weeks in the window: ${missing.map((h) => h.hospital_code).join(", ")}.`} /></p>
      ) : null}
    </div>
  );
}
