"use client";

import { useSearchParams } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";

import { type CarePatch, type CareRow, clusterList, filterByCluster, type Layout, parseCareParams, pinned, sortRows, withCareParams } from "@/lib/careMapState";

import { CareList } from "./CareList";
import { CareMap } from "./CareMap";
import type { CareMapProps } from "./CareMapLeaflet";
import { ClusterChips, LayoutToggle } from "./CareControls";
import { HospitalDrawer } from "./HospitalDrawer";

const WIDE = "(min-width: 640px)";
const subscribe = (cb: () => void) => {
  const mq = window.matchMedia(WIDE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

/**
 * The hospital map with its controls: cluster chips, a Map | List toggle, the list, and the details
 * drawer. All of it is in the address (?cluster= &layout= &hospital= &sort=), read here and written
 * with the History API, which Next.js keeps in step with useSearchParams. That makes a change instant: the
 * server page is not asked for again. Opening a hospital adds a history entry (Back closes it);
 * the filter, layout and order replace the current one.
 * - The screen's default layout (no ?layout=) is picked by CSS: the list below 640px, the map from
 *   640px. An explicit ?layout= always wins. The toggle reads the same media query.
 * - The filter applies to the map's hospital markers and the list. The search's nearest clinics and
 *   the nearest-EDs cards are not filtered.
 * - `bodies` are the drawers' contents, made on the server for every hospital.
 */
export function CareMapPanel({ rows, bodies, map, provenance }: {
  rows: CareRow[]; bodies: Record<string, ReactNode>; map: Omit<CareMapProps, "hospitals" | "onOpen">; provenance: ReactNode }) {
  const search = useSearchParams().toString();
  const params = useMemo(() => parseCareParams(search, rows), [search, rows]);
  const wide = useSyncExternalStore((cb) => subscribe(cb), () => window.matchMedia(WIDE).matches, () => true);
  const pushed = useRef(false);

  const go = useCallback((patch: CarePatch, how: "push" | "replace") => {
    const q = withCareParams(window.location.search, patch);
    const url = `${window.location.pathname}${q ? `?${q}` : ""}${window.location.hash}`;
    if (how === "push") { window.history.pushState(null, "", url); pushed.current = true; } else window.history.replaceState(null, "", url);
  }, []);

  // One stable function for the map: its markers keep the first one they were given.
  const open = useCallback((code: string) => go({ hospital: code }, "push"), [go]);
  const close = useCallback(() => {
    if (!new URLSearchParams(window.location.search).has("hospital")) return;
    if (pushed.current) { pushed.current = false; window.history.back(); } else go({ hospital: null }, "replace");
  }, [go]);
  useEffect(() => {
    const reset = () => { pushed.current = false; };
    window.addEventListener("popstate", reset);
    return () => window.removeEventListener("popstate", reset);
  }, []);

  const clusters = useMemo(() => clusterList(rows), [rows]);
  const counts = useMemo(() => Object.fromEntries(clusters.map((c) => [c, rows.filter((r) => r.cluster === c).length])), [clusters, rows]);
  const shown = useMemo(() => filterByCluster(rows, params.cluster), [rows, params.cluster]);
  const onMap = useMemo(() => pinned(shown), [shown]);
  const listed = useMemo(() => sortRows(shown, params.sort), [shown, params.sort]);
  const mapHospitals = useMemo(
    () => onMap.map((r) => ({ code: r.code, name: r.name, latitude: r.latitude, longitude: r.longitude, level: r.level })), [onMap]);
  const unpinned = shown.length - onMap.length;
  const opened = params.hospital ? rows.find((r) => r.code === params.hospital) ?? null : null;

  // No ?layout=: both are in the page and CSS shows one. A ?layout= shows only that one.
  const mapClass = params.layout === "map" ? "" : params.layout === "list" ? "hidden" : "max-sm:hidden";
  const listClass = params.layout === "list" ? "" : params.layout === "map" ? "hidden" : "sm:hidden";
  const choose = (layout: Layout) => go({ layout }, "replace");

  return (
    <div data-testid="care-panel" data-cluster={params.cluster ?? "all"} data-layout={params.layout ?? "default"}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <ClusterChips clusters={clusters} counts={counts} selected={params.cluster} onSelect={(cluster) => go({ cluster }, "replace")} />
        <LayoutToggle value={params.layout} fallback={wide ? "map" : "list"} onSelect={choose} />
      </div>
      <p className="mb-3 text-sm text-muted" aria-live="polite" data-testid="care-count">
        Showing {shown.length} of {rows.length} hospitals{params.cluster ? ` in ${params.cluster}` : ""}.
        {unpinned > 0 ? ` ${unpinned} ${unpinned === 1 ? "has" : "have"} no map location and appears in the list only.` : ""}
      </p>
      <div className={mapClass} data-testid="care-map-view">
        <CareMap {...map} hospitals={mapHospitals} onOpen={open} />
      </div>
      <div className={listClass} data-testid="care-list-view">
        <CareList rows={listed} sort={params.sort} onSort={(sort) => go({ sort }, "replace")} onOpen={open} />
      </div>
      {provenance}
      <HospitalDrawer code={opened?.code ?? null} title={opened?.name ?? ""} onClose={close}>
        {opened ? bodies[opened.code] : null}
      </HospitalDrawer>
    </div>
  );
}
