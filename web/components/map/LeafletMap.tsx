"use client";

import "leaflet/dist/leaflet.css";

import type { Feature, Geometry } from "geojson";
import L from "leaflet";
import { useEffect, useMemo, useRef } from "react";
import { CircleMarker, GeoJSON, MapContainer, Pane, TileLayer, useMap } from "react-leaflet";

import type { AreaCollection, Clinic } from "@/lib/api/types";
import { type AreaMetric, type AreaProps, areaValueText } from "@/lib/areaMetrics";
import { classify } from "@/lib/quantiles";

// OneMap (Singapore Land Authority) basemap. Its terms require the OneMap logo and this
// attribution, verbatim from https://www.onemap.gov.sg/docs/maps/resources/code-attr.txt
const ONEMAP_TILES = "https://www.onemap.gov.sg/maps/tiles/Grey/{z}/{x}/{y}.png";
const ONEMAP_ATTRIBUTION =
  '<img src="https://www.onemap.gov.sg/web-assets/images/logo/om_logo.png" style="height:20px;width:20px;" alt=""/>&nbsp;' +
  '<a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener noreferrer">OneMap</a>&nbsp;&copy;&nbsp;contributors&nbsp;&#124;&nbsp;' +
  '<a href="https://www.sla.gov.sg/" target="_blank" rel="noopener noreferrer">Singapore Land Authority</a>';
// Bounds and zoom range from OneMap's own Leaflet example.
const MAX_BOUNDS: L.LatLngBoundsExpression = [[1.144, 103.535], [1.494, 104.502]];

export interface MapProps {
  areas: AreaCollection;
  clinics: Pick<Clinic, "clinic_key" | "clinic_name" | "latitude" | "longitude" | "has_cdmp">[];
  metric: AreaMetric;
  breaks: number[];
  colors: string[];
  showClinics: boolean;
  cdmpOnly: boolean;
  selected: string | null;
  onSelect: (code: string) => void;
}

function FitToAreas({ areas }: { areas: AreaCollection }) {
  const map = useMap();
  useEffect(() => {
    const bounds = L.geoJSON(areas as unknown as GeoJSON.FeatureCollection).getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [8, 8] });
  }, [areas, map]);
  return null;
}

export default function LeafletMap({ areas, clinics, metric, breaks, colors, showClinics, cdmpOnly, selected, onSelect }: MapProps) {
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  const style = useMemo(() => (feature?: Feature<Geometry, AreaProps>) => {
    const p = feature?.properties;
    const cls = classify(p?.[metric.key], breaks);
    const isSelected = p?.planning_area_code === selected;
    return {
      fillColor: cls === -1 ? "url(#nodata-hatch)" : (colors[cls] ?? "#E2E8F0"),
      fillOpacity: 0.85,
      color: isSelected ? "#0F172A" : "#475569",
      weight: isSelected ? 3 : 0.8,
    };
  }, [metric.key, breaks, colors, selected]);

  // Make each area reachable by keyboard and named for screen readers.
  const onEachFeature = (feature: Feature<Geometry, AreaProps>, layer: L.Layer) => {
    const p = feature.properties;
    const label = `${p.planning_area}: ${metric.label} ${areaValueText(p, metric.key, metric.decimals)}. Press Enter for details.`;
    layer.on("click", () => onSelectRef.current(p.planning_area_code));
    layer.on("add", () => {
      const el = (layer as L.Path).getElement();
      if (!el) return;
      el.setAttribute("tabindex", "0");
      el.setAttribute("role", "button");
      el.setAttribute("aria-label", label);
      el.setAttribute("data-area", p.planning_area_code);
      el.addEventListener("keydown", (e) => {
        const key = (e as KeyboardEvent).key;
        if (key === "Enter" || key === " ") {
          e.preventDefault();
          onSelectRef.current(p.planning_area_code);
        }
      });
    });
  };

  const shown = clinics.filter((c) => c.latitude != null && c.longitude != null && (!cdmpOnly || c.has_cdmp === true));

  return (
    <>
      <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute" }}>
        <defs>
          <pattern id="nodata-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="#FFFFFF" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="#94A3B8" strokeWidth="3" />
          </pattern>
        </defs>
      </svg>
      <MapContainer center={[1.3521, 103.8198]} zoom={11} minZoom={10} maxZoom={19} maxBounds={MAX_BOUNDS}
                    scrollWheelZoom={false} className="h-[420px] w-full rounded-md sm:h-[520px]" attributionControl>
        <TileLayer url={ONEMAP_TILES} attribution={ONEMAP_ATTRIBUTION} detectRetina maxZoom={19} minZoom={11} />
        <FitToAreas areas={areas} />
        <GeoJSON key={`${metric.key}|${selected}`} data={areas as unknown as GeoJSON.FeatureCollection}
                 style={style as L.StyleFunction} onEachFeature={onEachFeature as (f: Feature, l: L.Layer) => void} />
        {showClinics ? (
          <Pane name="clinics" style={{ zIndex: 450, pointerEvents: "none" }}>
            {shown.map((c) => (
              <CircleMarker key={c.clinic_key} center={[c.latitude as number, c.longitude as number]} radius={2.5} interactive={false}
                            pathOptions={{ color: "#0F172A", weight: 1, fillColor: "#FFFFFF", fillOpacity: 1 }} />
            ))}
          </Pane>
        ) : null}
      </MapContainer>
    </>
  );
}
