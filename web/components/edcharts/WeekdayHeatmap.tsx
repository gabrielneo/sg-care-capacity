import type { Hospital, Insight } from "@/lib/api/types";
import { classFor, type ColourClass, divergingClasses, findingWeekday, type Mode, type Profile, sequentialClasses, textOn } from "@/lib/edCompare";
import { pinnedCaveat } from "@/lib/hospitalNotes";
import { fullName, splitByCare, URGENT_CARE_HEADING, URGENT_CARE_NOTE } from "@/lib/hospitals";
import { HospitalName } from "@/components/HospitalName";

import { CaveatChip } from "../CaveatChip";
import { Glossed } from "../terms/Glossed";
import { Term } from "../terms/Term";
import { hours, signed } from "./format";
import { HeatLegend } from "./HeatLegend";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** The marker on the peak cell and in the sentence that names it. */
const MARK = "①";

/**
 * Each hospital's weekday pattern. "vs usual": % above or below its own average, on a diverging,
 * colour-blind-safe scale symmetric about 0 (teal below, near-white at 0, amber above). Raw:
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
  // The EDs, then the urgent care centre in its own row group, never ordered among them (ADR 0012).
  const { rankable: eds, urgentCare: ucc } = splitByCare(profiles, (p) => p.code, hospitals);
  const peakCode = finding && peak != null && profiles.some((p) => p.code === finding.entity) ? finding.entity : null;
  const cellStyle = (v: number | null) => {
    const c = v == null ? null : classFor(v, classes);
    return { c, style: { background: c?.color ?? "transparent", color: c && textOn(c.color) === "light" ? "var(--on-data-light)" : "var(--on-data-dark)" } };
  };
  const row = (p: Profile) => {
    const h = byCode.get(p.code);
    const note = h ? pinnedCaveat(h) : null;
    return (
      <tr key={p.code} data-hospital={p.code}>
        <th scope="row" className="pr-2 text-left font-semibold text-ink">
          {h ? <HospitalName hospital={h} /> : <Term id={p.code.toLowerCase()} />}
          {mode === "raw" && note ? <span className="block font-normal" data-testid="pinned-caveat"><CaveatChip><Glossed text={note} /></CaveatChip></span> : null}
        </th>
        {p.values.map((v, d) => {
          const { c, style } = cellStyle(v);
          const marked = peakCode === p.code && peak === d;
          return (
            <td key={d} id={marked ? "peak-cell" : undefined} data-testid="heat-cell" data-value={v == null ? "" : v.toFixed(2)} data-color={c?.color ?? ""}
                data-annotated={marked ? "" : undefined}
                className={`h-9 rounded-sm border border-line text-center tabular-nums ${marked ? "outline outline-2 outline-offset-1 outline-ink" : ""}`}
                style={style}>
              {v == null ? <span className="text-muted">no data</span> : <>{marked ? <span aria-hidden="true">{MARK} </span> : null}{fmt(v)}</>}
            </td>
          );
        })}
      </tr>
    );
  };

  const all = [...eds, ...ucc];
  const nameOf = (code: string) => byCode.get(code);
  const caption = mode === "raw" ? "Average of daily median bed waits for each weekday, hours" : "Each weekday's bed wait, % above or below the hospital's own average";

  return (
    <div>
      {finding?.chart && peakCode ? (
        <p className="mb-2 text-small font-semibold text-ink" data-testid="chart-callout">
          <a href="#peak-cell" aria-label="Go to the marked cell" className="mr-1">{MARK}</a>
          <Term id={finding.entity.toLowerCase()} plain />, {finding.chart.callout} (the peak-day finding)
        </p>
      ) : null}
      <div className="hidden md:block" tabIndex={0} role="region" aria-label="Weekday pattern by hospital">
        <table className="w-full table-fixed border-separate border-spacing-0.5 text-meta" data-testid="heatmap">
          <caption className="sr-only">{caption}</caption>
          <colgroup><col className="w-label" /></colgroup>
          <thead>
            <tr>
              <th scope="col" className="text-left font-semibold text-muted">Hospital</th>
              {DAYS.map((d) => <th key={d} scope="col" className="font-semibold text-muted">{d}</th>)}
            </tr>
          </thead>
          <tbody data-group="ed">
            {eds.map(row)}
          </tbody>
          {ucc.length ? (
            <tbody data-group="ucc" data-testid="heat-ucc">
              <tr>
                <th scope="rowgroup" colSpan={8} className="border-t border-line pt-3 text-left font-semibold text-ink">
                  {URGENT_CARE_HEADING} <span className="font-normal text-muted">· {URGENT_CARE_NOTE}</span>
                </th>
              </tr>
              {ucc.map(row)}
            </tbody>
          ) : null}
        </table>
      </div>

      {/* Below 768px: days as rows, hospitals as columns that scroll sideways (audit F3). */}
      <div className="md:hidden">
        <p className="mb-1 text-meta text-muted" data-testid="heat-scroll-hint">Scroll sideways for every hospital →</p>
        <div className="overflow-x-auto border-r border-control" tabIndex={0} role="region" aria-label="Weekday pattern by hospital, scrolls sideways" data-testid="heat-scroller">
          <table className="border-separate border-spacing-0.5 text-meta" data-testid="heatmap-compact">
            <caption className="sr-only">{caption}</caption>
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 bg-surface pr-2 text-left font-semibold text-muted">Day</th>
                {all.map((p) => {
                  const h = nameOf(p.code);
                  return (
                    <th key={p.code} scope="col" className="min-w-14 font-semibold text-ink" data-hospital={p.code}>
                      <abbr title={h ? fullName(h) : p.code} className="no-underline">{p.code}</abbr>
                      {ucc.includes(p) ? <span className="block font-normal text-muted">Urgent care</span> : null}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {DAYS.map((d, di) => (
                <tr key={d}>
                  <th scope="row" className="sticky left-0 bg-surface pr-2 text-left font-semibold text-muted">{d}</th>
                  {all.map((p) => {
                    const v = p.values[di] ?? null;
                    const { c, style } = cellStyle(v);
                    const marked = peakCode === p.code && peak === di;
                    return (
                      <td key={p.code} data-testid="heat-cell-compact" data-value={v == null ? "" : v.toFixed(2)} data-color={c?.color ?? ""}
                          className={`h-9 rounded-sm border border-line text-center tabular-nums ${marked ? "outline outline-2 outline-offset-1 outline-ink" : ""}`} style={style}>
                        {v == null ? <span className="text-muted">no data</span> : <>{marked ? <span aria-hidden="true">{MARK} </span> : null}{fmt(v)}</>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <HeatLegend classes={classes} mode={mode} />
      <p className="mt-2 text-meta text-muted">
        {mode === "raw"
          ? "Darker means a longer wait. Hours, average of each day's median for that weekday."
          : "Each weekday against the hospital's own average: teal is shorter, amber is longer. The middle class is about average."}
      </p>
      {missing.length ? (
        <p className="mt-1 text-meta text-muted"><Glossed text={`Not shown, with fewer than 4 complete weeks in the window: ${missing.map((h) => h.hospital_code).join(", ")}.`} /></p>
      ) : null}
    </div>
  );
}
