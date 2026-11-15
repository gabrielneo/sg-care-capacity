import type { LiveReading } from "@/lib/api/types";
import { formatAsOf } from "@/lib/dates";
import { estimateCell } from "@/lib/estimates";

/** NUHS's latest readings as a table: one row per site and department, each with its own reading time. */
export function LiveTable({ readings }: { readings: LiveReading[] }) {
  return (
    <table className="w-full min-w-140 border-separate border-spacing-0 text-meta tabular-nums" data-testid="live-table">
      <caption className="sr-only">The National University Health System&apos;s latest estimates for each site and department, with the time of each reading</caption>
      <thead>
        <tr>
          <th scope="col" className="pr-3 text-left font-semibold text-muted">Site and department</th>
          <th scope="col" className="px-2 text-right font-semibold text-muted">Patients waiting</th>
          <th scope="col" className="px-2 text-right font-semibold text-muted">Estimated wait to see a doctor</th>
          <th scope="col" className="px-2 text-right font-semibold text-muted">Estimated wait for a ward bed</th>
          <th scope="col" className="pl-2 text-left font-semibold text-muted">Reading time</th>
        </tr>
      </thead>
      <tbody>
        {readings.map((r) => (
          <tr key={`${r.site_name}|${r.department}`}>
            <th scope="row" className="border-t border-line py-2 pr-3 text-left font-normal">{r.site_name}: {r.department}</th>
            <td className="border-t border-line px-2 text-right">{r.patients_waiting ?? "Not stated"}</td>
            <td className="border-t border-line px-2 text-right">{estimateCell(r.est_wait_to_see_doctor_hours, r.est_wait_to_see_doctor_qualifier)}</td>
            <td className="border-t border-line px-2 text-right">{estimateCell(r.est_bed_wait_hours, r.est_bed_wait_qualifier)}</td>
            <td className="border-t border-line pl-2 text-left">{formatAsOf(r.snapshot_at, { withTime: true })}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
