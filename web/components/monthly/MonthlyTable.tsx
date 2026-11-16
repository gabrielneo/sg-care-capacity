import { hours, signed } from "@/components/edcharts/format";
import { MONTHS, type Point, sortPoints } from "@/lib/monthly";

const num = (v: number | null) => (v == null ? <span className="text-muted">no figure</span> : Math.round(v).toLocaleString("en-SG"));
const pct = (v: number | null) => (v == null ? <span className="text-muted">none</span> : `${signed(v, 0)}%`);

/** The monthly figures behind the charts, newest first. A partial month shows its days and no change; a missing figure says so. */
export function MonthlyTable({ points, caption }: { points: Point[]; caption: string }) {
  const rows = sortPoints(points).reverse();
  return (
    <table className="w-full border-separate border-spacing-0 text-meta tabular-nums" data-testid="monthly-table">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          <th scope="col" className="sticky left-0 bg-surface pr-3 text-left font-semibold text-muted">Month</th>
          <th scope="col" className="px-2 text-right font-semibold text-ink">Bed wait (hours)</th>
          <th scope="col" className="px-2 text-right font-semibold text-ink">ED visits</th>
          <th scope="col" className="px-2 text-right font-semibold text-ink">Wait vs a year before</th>
          <th scope="col" className="px-2 text-right font-semibold text-ink">Visits vs a year before</th>
          <th scope="col" className="px-2 text-right font-semibold text-ink">Wait vs month before</th>
          <th scope="col" className="px-2 text-left font-semibold text-muted">Note</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <tr key={`${p.year}-${p.month}`}>
            <th scope="row" className="sticky left-0 whitespace-nowrap border-t border-line bg-surface pr-3 text-left font-normal text-muted">{MONTHS[p.month - 1]} {p.year}</th>
            <td className="border-t border-line px-2 text-right">{p.wait == null ? <span className="text-muted">no figure</span> : hours(p.wait)}</td>
            <td className="border-t border-line px-2 text-right">{num(p.visits)}</td>
            <td className="border-t border-line px-2 text-right">{pct(p.waitYoy)}</td>
            <td className="border-t border-line px-2 text-right">{pct(p.visitsYoy)}</td>
            <td className="border-t border-line px-2 text-right">{pct(p.waitMom)}</td>
            <td className="border-t border-line px-2 text-left text-muted">{p.complete ? "" : `Partial month: ${p.note}`}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
