import { HospitalName } from "@/components/HospitalName";
import { hours, shortDay, signed } from "./format";
import type { Mode } from "@/lib/edCompare";
import type { Panel } from "./SmallMultiples";

/** The small multiples' figures as a table: one row per day, one column per hospital. A missing day says "no data". */
export function DailyTable({ panels, mode }: { panels: Panel[]; mode: Mode }) {
  const days = panels[0]?.series.map((d) => d.date) ?? [];
  const fmt = (v: number) => (mode === "raw" ? hours(v) : signed(v));
  return (
    <table className="w-full border-separate border-spacing-0 text-meta tabular-nums" data-testid="daily-table">
      <caption className="sr-only">{mode === "raw" ? "Daily median bed wait, hours" : "Daily median bed wait, hours above (+) or below (−) the hospital's usual level"}</caption>
      <thead>
        <tr>
          <th scope="col" className="sticky left-0 bg-surface pr-3 text-left font-semibold text-muted">Day</th>
          {panels.map((p) => <th key={p.hospital.hospital_code} scope="col" className="px-2 text-right font-semibold text-ink"><HospitalName hospital={p.hospital} /></th>)}
        </tr>
      </thead>
      <tbody>
        {days.map((date, i) => (
          <tr key={date}>
            <th scope="row" className="sticky left-0 whitespace-nowrap border-t border-line bg-surface pr-3 text-left font-normal text-muted">{shortDay(date)}</th>
            {panels.map((p) => {
              const v = p.series[i]?.value ?? null;
              return <td key={p.hospital.hospital_code} className="border-t border-line px-2 text-right">{v == null ? <span className="text-muted">no data</span> : fmt(v)}</td>;
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
