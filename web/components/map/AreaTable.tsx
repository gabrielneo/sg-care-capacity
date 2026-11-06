import Link from "next/link";

import { type AreaProps, formatValue, sortAreas, TABLE_COLUMNS } from "@/lib/areaMetrics";

import { Glossed } from "../terms/Glossed";

/** The map's data as a sortable table. Server-rendered: works without JavaScript and with screen readers. */
export function AreaTable({ areas, sort, dir }: { areas: AreaProps[]; sort?: string; dir?: string }) {
  const s = sortAreas(areas, sort, dir);
  const href = (key: string) => {
    const next = s.key === key && s.dir === "asc" ? "desc" : "asc";
    return `/access-map?view=table&sort=${key}&dir=${next}`;
  };
  return (
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Area table (scrolls sideways)">
      <table className="w-full min-w-[880px] border-collapse text-sm" data-testid="area-table">
        <caption className="mb-2 text-left text-xs text-muted">
          Clinic access for residents aged 65+, {areas.length} areas. Sorted by{" "}
          {TABLE_COLUMNS.find((c) => c.key === s.key)?.label} ({s.dir === "asc" ? "ascending" : "descending"}); areas with no data are listed last.
        </caption>
        <thead>
          <tr className="border-b border-line text-left">
            {TABLE_COLUMNS.map((c) => (
              <th key={c.key} scope="col" aria-sort={s.key === c.key ? (s.dir === "asc" ? "ascending" : "descending") : "none"}
                  className={`px-2 py-2 font-semibold ${c.numeric ? "text-right" : ""}`}>
                <Link href={href(c.key)} className="text-ink no-underline hover:underline">
                  <Glossed text={c.label} plain />
                  <span aria-hidden="true">{s.key === c.key ? (s.dir === "asc" ? " ▲" : " ▼") : ""}</span>
                </Link>
              </th>
            ))}
            <th scope="col" className="px-2 py-2 font-semibold">Data note</th>
          </tr>
        </thead>
        <tbody>
          {s.rows.map((a) => (
            <tr key={a.planning_area_code} className="border-b border-line align-top">
              {TABLE_COLUMNS.map((c, i) => {
                const v = a[c.key as keyof AreaProps];
                const text = c.numeric ? formatValue(v as number | null, c.decimals) : String(v ?? "No data");
                return i === 0 ? (
                  <th key={c.key} scope="row" className="px-2 py-1.5 text-left font-medium">{text}</th>
                ) : (
                  <td key={c.key} className={`px-2 py-1.5 ${c.numeric ? "text-right tabular-nums" : ""} ${text === "No data" ? "text-muted" : ""}`}>
                    {text}
                  </td>
                );
              })}
              <td className="px-2 py-1.5 text-xs text-muted">{a.dq_note ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
