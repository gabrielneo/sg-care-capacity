import { HospitalName } from "@/components/HospitalName";
import { Glossed } from "@/components/terms/Glossed";
import type { Hospital } from "@/lib/api/types";
import { formatAsOf } from "@/lib/dates";
import type { SlopePair } from "@/lib/edCompare";
import { estimateCell } from "@/lib/estimates";

import { hours } from "./format";

/** NUHS's estimate and MOH's daily median for each site, each with its own date: two measures on two days. */
export function SlopeTable({ pairs, hospitals }: { pairs: SlopePair[]; hospitals: Hospital[] }) {
  const byCode = new Map(hospitals.map((h) => [h.hospital_code, h]));
  return (
    <table className="w-full min-w-120 border-separate border-spacing-0 text-meta tabular-nums" data-testid="slope-table">
      <caption className="sr-only">The latest National University Health System estimate of the bed wait beside the Ministry of Health&apos;s latest daily median, with the date of each</caption>
      <thead>
        <tr>
          <th scope="col" className="pr-3 text-left font-semibold text-muted">Hospital</th>
          <th scope="col" className="px-2 text-right font-semibold text-muted"><Glossed text="MOH daily median (h)" /></th>
          <th scope="col" className="px-2 text-left font-semibold text-muted"><Glossed text="MOH day" /></th>
          <th scope="col" className="px-2 text-right font-semibold text-muted"><Glossed text="NUHS estimate (h)" /></th>
          <th scope="col" className="pl-2 text-left font-semibold text-muted"><Glossed text="NUHS reading" /></th>
        </tr>
      </thead>
      <tbody>
        {pairs.map((p) => {
          const h = byCode.get(p.code);
          return (
            <tr key={p.code}>
              <th scope="row" className="border-t border-line py-2 pr-3 text-left font-normal">{h ? <HospitalName hospital={h} /> : p.code}</th>
              <td className="border-t border-line px-2 text-right">{p.moh ? hours(p.moh.value) : <span className="text-muted">no data</span>}</td>
              <td className="border-t border-line px-2 text-left">{p.moh ? formatAsOf(p.moh.date) : ""}</td>
              <td className="border-t border-line px-2 text-right">{p.nuhs ? estimateCell(p.nuhs.value, p.nuhs.bound) : <span className="text-muted">no data</span>}</td>
              <td className="border-t border-line pl-2 text-left">{p.nuhs ? formatAsOf(p.nuhs.at, { withTime: true }) : ""}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
