"use client";

import type { Layout } from "@/lib/careMapState";

const BUTTON = "min-h-11 rounded-full border px-4 text-sm font-medium";
const ON = "border-accent bg-accent text-surface";
const OFF = "border-line bg-surface text-ink hover:border-accent";

/**
 * Filter by healthcare cluster. The chips are the clusters in the data (dim_hospital.cluster), plus
 * "All". The chosen one is said by aria-pressed and by a tick, not by colour alone.
 */
export function ClusterChips({ clusters, counts, selected, onSelect }: {
  clusters: string[]; counts: Record<string, number>; selected: string | null; onSelect: (cluster: string | null) => void }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const chip = (label: string, value: string | null, n: number) => {
    const on = selected === value;
    return (
      <button key={label} type="button" aria-pressed={on} onClick={() => onSelect(value)} className={`${BUTTON} ${on ? ON : OFF}`}
              data-testid="cluster-chip" data-cluster={value ?? "all"}>
        {on ? <span aria-hidden="true">✓ </span> : null}{label} <span className="tabular-nums">({n})</span>
      </button>
    );
  };
  return (
    <div role="group" aria-label="Show hospitals from" className="flex flex-wrap gap-2" data-testid="cluster-chips">
      {chip("All", null, total)}
      {clusters.map((c) => chip(c, c, counts[c] ?? 0))}
    </div>
  );
}

/**
 * Map or list. `value` null means the screen's default (list on a phone, map elsewhere, picked by CSS);
 * `fallback` is what that default is on this screen, so the right button reads as pressed.
 */
export function LayoutToggle({ value, fallback, onSelect }: { value: Layout | null; fallback: Layout; onSelect: (layout: Layout) => void }) {
  const current = value ?? fallback;
  return (
    <div role="group" aria-label="Show hospitals as" className="inline-flex overflow-hidden rounded-full border border-line" data-testid="layout-toggle">
      {(["map", "list"] as const).map((l) => (
        <button key={l} type="button" aria-pressed={current === l} onClick={() => onSelect(l)} data-layout={l}
                className={`min-h-11 px-4 text-sm font-medium ${current === l ? ON : "bg-surface text-ink"}`}>
          {current === l ? <span aria-hidden="true">✓ </span> : null}{l === "map" ? "Map" : "List"}
        </button>
      ))}
    </div>
  );
}
