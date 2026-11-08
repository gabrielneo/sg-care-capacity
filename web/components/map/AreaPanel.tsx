"use client";

import { useEffect, useRef } from "react";

import { AREA_METRICS, type AreaProps, areaValueText } from "@/lib/areaMetrics";
import { formatAsOf } from "@/lib/dates";

import { Glossed } from "../terms/Glossed";

/** Details for one planning area. Focus moves to its heading when it opens. */
export function AreaPanel({ area, caveats, onClose }: { area: AreaProps; caveats: Record<string, string>; onClose: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), [area.planning_area_code]);
  const count = (v: number | null | undefined) => (v == null ? "No data" : v.toLocaleString("en-SG"));
  return (
    <aside aria-labelledby="area-panel-title" className="rounded-lg border border-line bg-surface p-4" data-testid="area-panel">
      <div className="flex items-start justify-between gap-2">
        <h3 id="area-panel-title" ref={heading} tabIndex={-1} className="text-base font-semibold">
          {area.planning_area}
          <span className="block text-xs font-normal text-muted">{area.region_name}</span>
        </h3>
        <button type="button" onClick={onClose} className="min-h-11 rounded-md px-3 text-sm text-accent hover:bg-page">
          Close<span className="sr-only"> {area.planning_area} details</span>
        </button>
      </div>
      <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-muted">Residents aged 65+</dt>
        <dd className="text-right tabular-nums">{count(area.residents_65plus)}</dd>
        <dt className="text-muted">All residents</dt>
        <dd className="text-right tabular-nums">{count(area.residents_total)}</dd>
        <dt className="text-muted"><Glossed text="CHAS GP clinics (of which CDMP)" /></dt>
        <dd className="text-right tabular-nums">{count(area.chas_clinics)} ({count(area.cdmp_clinics)})</dd>
        {AREA_METRICS.map((m) => (
          <div key={m.key} className="contents">
            <dt className="text-muted"><Glossed text={m.label} /></dt>
            <dd className="text-right tabular-nums">
              {areaValueText(area, m.key, m.decimals)}
              {area[m.key] != null ? (m.unit === "% of land" ? "%" : m.unit === "km" ? " km" : "") : ""}
            </dd>
          </div>
        ))}
        <dt className="text-muted">Nearest <Glossed text="polyclinic" /></dt>
        <dd className="text-right">{area.nearest_polyclinic ?? "No data"}</dd>
      </dl>
      <div className="mt-3 rounded-md bg-page p-2 text-xs">
        <p className="font-semibold">Data note</p>
        <p className="mt-0.5">{area.dq_note ? area.dq_note.split(";").map((s) => s.trim()).join(". ") + "." : "No area-specific notes."}</p>
        <p className="mt-1 text-muted">
          As of {area.as_of ? formatAsOf(area.as_of) : "unknown"} (the older of the clinic list and the population count).{" "}
          <Glossed text={caveats["fct_area_access.cdmp_clinics_per_1k_seniors"] ?? ""} />
        </p>
      </div>
    </aside>
  );
}
