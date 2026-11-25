import { HospitalName } from "@/components/HospitalName";
import type { Hospital } from "@/lib/api/types";
import type { Usual } from "@/lib/edCompare";
import { splitByCare, URGENT_CARE_NOTE } from "@/lib/hospitals";
import { levelFor } from "@/lib/status";

import { hours, signed } from "./format";

/** The last column in words: the status of the week against the hospital's own range, never a count of weeks. */
const RANGE_WORD = { much_higher: "Well above", higher: "Above", usual: "Within", lower: "Below", unknown: "No comparison" } as const;

/** The latest-week-against-usual figures as a table: the full EDs first, the urgent care centre last and marked as not compared. */
export function UsualTable({ usuals, hospitals }: { usuals: Record<string, Usual>; hospitals: Hospital[] }) {
  const { rankable, urgentCare } = splitByCare(hospitals, (h) => h.hospital_code, hospitals);
  const row = (h: Hospital, note?: string) => {
    const u = usuals[h.hospital_code];
    return (
      <tr key={h.hospital_code}>
        <th scope="row" className="border-t border-line py-2 pr-3 text-left font-normal"><HospitalName hospital={h} />{note ? <span className="block text-meta text-muted">{note}</span> : null}</th>
        <td className="border-t border-line px-2 text-right">{u?.latest != null ? hours(u.latest) : <span className="text-muted">no data</span>}</td>
        <td className="border-t border-line px-2 text-right">{u?.usual != null ? hours(u.usual) : <span className="text-muted">no usual level</span>}</td>
        <td className="border-t border-line px-2 text-right">{u?.pct != null ? `${signed(u.pct, 0)}%` : <span className="text-muted">no data</span>}</td>
        <td className="border-t border-line px-2 text-right" data-testid="usual-swing">{u?.swing != null ? `±${hours(u.swing)}` : <span className="text-muted">not enough weeks</span>}</td>
        <td className="border-t border-line pl-2 text-right" data-testid="usual-range">{RANGE_WORD[levelFor(u?.pct, u?.position, u?.z)]}</td>
      </tr>
    );
  };
  return (
    <table className="w-full min-w-120 border-separate border-spacing-0 text-meta tabular-nums" data-testid="usual-table">
      <caption className="sr-only">The latest complete week&apos;s bed wait, in hours, against each hospital&apos;s usual level</caption>
      <thead>
        <tr>
          <th scope="col" className="pr-3 text-left font-semibold text-muted">Hospital</th>
          <th scope="col" className="px-2 text-right font-semibold text-muted">Latest week (h)</th>
          <th scope="col" className="px-2 text-right font-semibold text-muted">Usual (h)</th>
          <th scope="col" className="px-2 text-right font-semibold text-muted">Difference</th>
          <th scope="col" className="px-2 text-right font-semibold text-muted">Usual week-to-week swing (h)</th>
          <th scope="col" className="pl-2 text-right font-semibold text-muted">Latest week against its own range</th>
        </tr>
      </thead>
      <tbody>{rankable.map((h) => row(h))}{urgentCare.map((h) => row(h, URGENT_CARE_NOTE))}</tbody>
    </table>
  );
}
