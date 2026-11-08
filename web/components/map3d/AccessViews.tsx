"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { Skeleton } from "@/components/States";
import type { AreaCollection, Clinic, Svy21Collection } from "@/lib/api/types";
import { type Capabilities, chooseView, detectCapabilities, type Requested, styleAreas } from "@/lib/map3d";

import { AccessMap } from "../map/AccessMap";
import { AreaPanel } from "../map/AreaPanel";
import { ViewTabs } from "../map/ViewTabs";
import { Map3DLegend } from "./Map3DLegend";

// three.js and the scene load only when the 3D view is shown, after the page has painted.
const AccessMap3D = dynamic(() => import("./AccessMap3D"), {
  ssr: false,
  loading: () => <Skeleton className="h-[420px] w-full sm:h-[520px]" label="Loading the 3D map" />,
});

const INTRO_KEY = "access-map-3d-intro-seen";
export const READING_GUIDE = "Taller = more seniors. Darker = fewer chronic-care clinics per senior. Tall and dark areas need attention first.";

export interface AccessViewsProps {
  requested: Requested;
  areas: AreaCollection;
  clinics: Pick<Clinic, "clinic_key" | "clinic_name" | "latitude" | "longitude" | "has_cdmp">[];
  caveats: Record<string, string>;
  /** Area names to label in 3D, in priority order. */
  labels: string[];
}

// What the browser can do is only known in the browser: null on the server and during hydration.
let capabilities: Capabilities | null = null;
const browserCapabilities = () => (capabilities ??= detectCapabilities());
const noSubscription = () => () => {};

type Layer = { status: "loading" } | { status: "ready"; layer: Svy21Collection } | { status: "failed"; reason: string };

function seenIntro(): boolean {
  try {
    return sessionStorage.getItem(INTRO_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * The 3D or 2D map, chosen in the browser: 3D needs WebGL; without an explicit request, reduced
 * motion or low device memory also mean 2D. Until the choice is made, a placeholder of the same
 * height holds the space, so nothing shifts.
 */
export function AccessViews({ requested, areas, clinics, caveats, labels }: AccessViewsProps) {
  const caps = useSyncExternalStore(noSubscription, browserCapabilities, () => null);
  const choice = requested === "2d" ? { view: "2d" as const, reason: null, reducedMotion: false }
    : caps ? { ...chooseView(requested, caps), reducedMotion: caps.reducedMotion } : null;
  const [layer, setLayer] = useState<Layer>({ status: "loading" });
  const [selected, setSelected] = useState<string | null>(null);

  const want3d = choice?.view === "3d";
  useEffect(() => {
    if (!want3d) return;
    let live = true;
    fetch("/access-map/svy21")
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 404 ? "missing" : "failed");
        return (await r.json()) as { data: Svy21Collection };
      })
      .then((body) => live && setLayer({ status: "ready", layer: body.data }))
      .catch((err: Error) => live && setLayer({ status: "failed", reason: err.message === "missing"
        ? "This week's data release has no 3D map layer, so the 2D map is shown."
        : "The 3D map couldn't be loaded, so the 2D map is shown." }));
    return () => { live = false; };
  }, [want3d]);

  const styled = useMemo(() => (layer.status === "ready" ? styleAreas(layer.layer.features) : null), [layer]);
  const show3d = want3d && layer.status !== "failed";
  const reason = layer.status === "failed" && want3d ? layer.reason : choice?.reason ?? null;
  const area = areas.features.find((f) => f.properties.planning_area_code === selected)?.properties ?? null;
  const [intro] = useState(() => typeof window !== "undefined" && !seenIntro());

  return (
    <div data-testid="access-views" data-view={choice ? (show3d ? "3d" : "2d") : "pending"}>
      <ViewTabs active={choice ? (show3d ? "3d" : "map") : null} />
      {reason ? (
        <p className="mb-3 text-sm text-muted" data-testid="view-reason">
          {reason}{" "}
          {reason.includes("Reduced motion") || reason.includes("little memory")
            ? <Link href="/access-map?view=3d">Show the 3D map anyway</Link> : null}
        </p>
      ) : null}
      {choice === null ? (
        <Skeleton className="h-[420px] w-full sm:h-[520px]" label="Loading the map" />
      ) : show3d ? (
        <div>
          <p className="mb-3 text-sm font-medium text-ink" data-testid="reading-guide">{READING_GUIDE}</p>
          {layer.status === "ready" ? (
            <AccessMap3D layer={layer.layer} labels={labels.slice(0, 5)} selected={selected} onSelect={setSelected}
                         intro={intro && !choice.reducedMotion}
                         onIntroDone={() => { try { sessionStorage.setItem(INTRO_KEY, "1"); } catch { /* private mode */ } }} />
          ) : (
            <Skeleton className="h-[420px] w-full sm:h-[520px]" label="Loading the 3D map" />
          )}
          {labels.length ? (
            <p className="mt-2 text-sm text-ink" data-testid="map3d-key">
              <span className="font-medium">Priority areas in this week&apos;s findings: </span>
              {labels.slice(0, 5).map((name, i) => <span key={name}>{i ? " · " : ""}<strong>{i + 1}</strong> {name}</span>)}
            </p>
          ) : null}
          <p className="mt-2 text-xs text-muted">
            Drag to turn the map, scroll or pinch to zoom. Select an area for its details. For keyboard use,{" "}
            <Link href="/access-map?view=map">the 2D map</Link> and <Link href="/access-map?view=table">the table</Link> have the
            same figures.
          </p>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            {area ? <AreaPanel area={area} caveats={caveats} onClose={() => setSelected(null)} /> : null}
            {styled ? <Map3DLegend classes={styled.classes} excluded={styled.excluded} maxSeniors={styled.maxSeniors} /> : null}
          </div>
        </div>
      ) : (
        <AccessMap areas={areas} clinics={clinics} caveats={caveats} />
      )}
    </div>
  );
}
