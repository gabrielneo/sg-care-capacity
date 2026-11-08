"use client";

import dynamic from "next/dynamic";
import { useId, useMemo, useState } from "react";

import { Skeleton } from "@/components/States";
import type { AreaCollection, Clinic } from "@/lib/api/types";
import { AREA_METRICS, DEFAULT_METRIC, metricByKey, type MetricKey } from "@/lib/areaMetrics";
import { classColors, legendClasses, quantileBreaks } from "@/lib/quantiles";

import { AreaPanel } from "./AreaPanel";
import { Glossed } from "../terms/Glossed";
import { MapLegend } from "./MapLegend";

const LeafletMap = dynamic(() => import("./LeafletMap"), {
  ssr: false,
  loading: () => <Skeleton className="h-[420px] w-full sm:h-[520px]" label="Loading map" />,
});

export interface AccessMapProps {
  areas: AreaCollection;
  clinics: Pick<Clinic, "clinic_key" | "clinic_name" | "latitude" | "longitude" | "has_cdmp">[];
  caveats: Record<string, string>;
}

export function AccessMap({ areas, clinics, caveats }: AccessMapProps) {
  const [metricKey, setMetricKey] = useState<MetricKey>(DEFAULT_METRIC);
  const [showClinics, setShowClinics] = useState(true);
  const [cdmpOnly, setCdmpOnly] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const ids = { metric: useId(), clinics: useId() };
  const metric = metricByKey(metricKey);

  const { breaks, classes, colors, noData, noResidents, smallAreas } = useMemo(() => {
    const values = areas.features.map((f) => f.properties[metric.key]);
    const b = quantileBreaks(values);
    // Darker = worse access, on every measure (and in the 3D view).
    return { breaks: b, classes: legendClasses(values, b, metric.higherIsBetter),
             colors: classColors(b.length + 1, metric.higherIsBetter),
             // A per-senior ratio where no seniors live is not applicable, not missing (audit L-5).
             noResidents: metric.key.includes("per_1k") ? areas.features.filter((f) => f.properties[metric.key] == null
               && f.properties.residents_65plus === 0).length : 0,
             noData: values.filter((v) => v == null).length,
             smallAreas: areas.features.filter((f) => f.properties[metric.key] != null
               && (f.properties.residents_65plus ?? 0) < 1000).length };
  }, [areas, metric.key, metric.higherIsBetter]);

  const area = areas.features.find((f) => f.properties.planning_area_code === selected)?.properties ?? null;
  const shownClinics = clinics.filter((c) => !cdmpOnly || c.has_cdmp === true).length;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-x-6 gap-y-3">
        <label htmlFor={ids.metric} className="w-full min-w-0 text-sm sm:w-auto">
          <span className="block font-semibold">Measure</span>
          <select id={ids.metric} value={metricKey} onChange={(e) => setMetricKey(e.target.value as MetricKey)}
                  className="mt-1 min-h-11 w-full rounded-md border border-line bg-surface px-2 sm:w-auto">
            {AREA_METRICS.map((m) => (
              <option key={m.key} value={m.key}>{m.label}</option>
            ))}
          </select>
        </label>
        <fieldset className="text-sm" aria-describedby={ids.clinics}>
          <legend className="font-semibold">Clinic points</legend>
          <div className="mt-1 flex flex-wrap gap-x-4">
            <label className="flex min-h-11 items-center gap-2">
              <input type="checkbox" checked={showClinics} onChange={(e) => setShowClinics(e.target.checked)} className="h-4 w-4 accent-accent" />
              Show clinics
            </label>
            <label className="flex min-h-11 items-center gap-2">
              <input type="checkbox" checked={cdmpOnly} disabled={!showClinics} onChange={(e) => setCdmpOnly(e.target.checked)}
                     className="h-4 w-4 accent-accent" />
              <Glossed text="CDMP only" plain />
            </label>
          </div>
          <p id={ids.clinics} className="text-xs text-muted" aria-live="polite">
            {showClinics ? <Glossed text={`${shownClinics.toLocaleString("en-SG")} ${cdmpOnly ? "CDMP" : "CHAS"} GP clinics shown as white dots.`} /> : "Clinics hidden."}
          </p>
        </fieldset>
      </div>

      <LeafletMap areas={areas} clinics={clinics} metric={metric} breaks={breaks} colors={colors} showClinics={showClinics}
                  cdmpOnly={cdmpOnly} selected={selected} onSelect={setSelected} />
      <p className="mt-2 text-xs text-muted">Select an area (click, tap, or Tab then Enter) to see its details.</p>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        {area ? <AreaPanel area={area} caveats={caveats} onClose={() => setSelected(null)} /> : null}
        <div className="space-y-2">
          <MapLegend metric={metric} classes={classes} noData={noData - noResidents} noResidents={noResidents} smallAreas={smallAreas} />
          {caveats[metric.metricId] ? <p className="text-xs text-muted"><Glossed text={caveats[metric.metricId]!} /></p> : null}
        </div>
      </div>
    </div>
  );
}
