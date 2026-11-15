import type { QuadrantPoint, ShortfallBar } from "@/lib/accessCharts";

import { Glossed } from "../terms/Glossed";

/** "Show as table" for the quadrant: one row per ranked area, priority areas first. */
export function QuadrantTable({ points }: { points: QuadrantPoint[] }) {
  const rows = [...points].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || a.name.localeCompare(b.name));
  return (
    <table className="w-full min-w-100 border-separate border-spacing-0 text-meta tabular-nums" data-testid="quadrant-table">
      <caption className="sr-only">Each area&apos;s residents aged 65+ and Chronic Disease Management Programme clinics per 1,000 of them</caption>
      <thead>
        <tr>
          <th scope="col" className="pr-3 text-left font-semibold text-muted">Area</th>
          <th scope="col" className="px-2 text-right font-semibold text-muted">Residents aged 65+</th>
          <th scope="col" className="px-2 text-right font-semibold text-muted"><Glossed text="CDMP clinics per 1,000" /></th>
          <th scope="col" className="pl-2 text-right font-semibold text-muted">Priority</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <tr key={p.name}>
            <th scope="row" className="border-t border-line py-2 pr-3 text-left font-normal">{p.name}</th>
            <td className="border-t border-line px-2 text-right">{p.seniors.toLocaleString("en-SG")}</td>
            <td className="border-t border-line px-2 text-right">{p.rate.toFixed(2)}</td>
            <td className="border-t border-line pl-2 text-right">{p.rank ?? ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** "Show as table" for the shortfall bars. */
export function ShortfallTable({ bars }: { bars: ShortfallBar[] }) {
  return (
    <table className="w-full border-separate border-spacing-0 text-meta tabular-nums" data-testid="shortfall-table">
      <caption className="sr-only">Chronic Disease Management Programme clinics each priority area is short of the national rate</caption>
      <thead>
        <tr>
          <th scope="col" className="pr-3 text-left font-semibold text-muted">Area</th>
          <th scope="col" className="px-2 text-right font-semibold text-muted">Priority</th>
          <th scope="col" className="pl-2 text-right font-semibold text-muted">Clinics short</th>
        </tr>
      </thead>
      <tbody>
        {bars.map((b) => (
          <tr key={b.name}>
            <th scope="row" className="border-t border-line py-2 pr-3 text-left font-normal">{b.name}</th>
            <td className="border-t border-line px-2 text-right">{b.rank}</td>
            <td className="border-t border-line pl-2 text-right">about {Math.round(b.shortfall)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
