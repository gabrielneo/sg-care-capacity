import { hours, signed } from "@/components/edcharts/format";
import { monthsText, type YearSoFar } from "@/lib/monthly";

const pct = (v: number | null) => (v == null ? <span className="text-muted">none</span> : `${signed(v, 0)}%`);

/** Each year over the same months, side by side: the fair way to say whether this year is above or below last. */
export function YearSoFarTable({ rows }: { rows: YearSoFar[] }) {
  if (!rows.length) return <p className="text-small text-muted" data-testid="year-so-far-empty">No month is complete in all three years yet.</p>;
  const span = monthsText(rows[0]!.months);
  return (
    <table className="w-full border-separate border-spacing-0 text-small tabular-nums" data-testid="year-so-far">
      <caption className="sr-only">{`Each year's average bed wait and total ED visits over the same months (${span}), and the change from the year before`}</caption>
      <thead>
        <tr>
          <th scope="col" className="pr-3 text-left font-semibold text-muted">{span}</th>
          <th scope="col" className="px-2 text-right font-semibold text-ink">Bed wait (hours)</th>
          <th scope="col" className="px-2 text-right font-semibold text-ink">vs year before</th>
          <th scope="col" className="px-2 text-right font-semibold text-ink">ED visits</th>
          <th scope="col" className="px-2 text-right font-semibold text-ink">vs year before</th>
        </tr>
      </thead>
      <tbody>
        {[...rows].reverse().map((r) => (
          <tr key={r.year}>
            <th scope="row" className="border-t border-line pr-3 text-left font-semibold text-ink">{r.year}</th>
            <td className="border-t border-line px-2 text-right">{hours(r.wait)}</td>
            <td className="border-t border-line px-2 text-right">{pct(r.waitChangePct)}</td>
            <td className="border-t border-line px-2 text-right">{Math.round(r.visits).toLocaleString("en-SG")}</td>
            <td className="border-t border-line px-2 text-right">{pct(r.visitsChangePct)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
