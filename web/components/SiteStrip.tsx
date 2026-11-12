"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useId, useState } from "react";

import { LEVEL_STYLE, LEVEL_SYMBOL } from "@/components/FreshnessBadge";
import { withCareParams } from "@/lib/careMapState";
import { formatAsOf } from "@/lib/dates";
import { viewHref } from "@/lib/homeViews";
import type { StripData, StripPill } from "@/lib/strip";

type Loaded = { ok: true; strip: StripData } | { ok: false };

const CHIP = "inline-flex h-7 items-center rounded-full border px-2.5 text-xs font-medium";

function Pill({ pill }: { pill: StripPill }) {
  const estimate = pill.id === "doctor";
  return (
    <span className={`inline-flex min-w-0 flex-col rounded-md border px-2 py-0.5 text-xs leading-[15px] ${LEVEL_STYLE[pill.level]}`}
          data-testid="strip-pill" data-pill={pill.id} data-level={pill.level}
          title={`${pill.dataset}: data as of ${formatAsOf(pill.asOf, { withTime: estimate })}${estimate ? ". NUHS estimates, for some hospitals only." : ""}`}>
      <span className="font-semibold"><span aria-hidden="true">{LEVEL_SYMBOL[pill.level]} </span>{pill.label}</span>
      <span>{pill.dataset} · {pill.source} · {pill.detail}</span>
    </span>
  );
}

/**
 * The slim strip under the top bar: how many hospitals are busier than usual, how fresh each dataset
 * is, and the cluster filter. Every pill is dated by its own source. The cluster chips write ?cluster=,
 * the same address state as the hospital map (lib/careMapState.ts), so they appear only where the map
 * is (the public view of the home page). Below 1280px the pills and chips sit behind "Details".
 */
export function SiteStrip() {
  const [data, setData] = useState<Loaded | null>(null);
  const [open, setOpen] = useState(false);
  const panel = useId();
  const pathname = usePathname();
  const search = useSearchParams();

  useEffect(() => {
    let live = true;
    fetch("/strip.json")
      .then((r) => r.json() as Promise<Loaded>)
      .then((b) => live && setData(b))
      .catch(() => live && setData({ ok: false }));
    return () => { live = false; };
  }, []);

  if (!data) return <div className="h-10 border-b border-line bg-surface" data-testid="site-strip-loading" />;
  if (!data.ok) {
    return <div className="flex h-10 items-center border-b border-line bg-surface px-4 text-xs text-muted" data-testid="site-strip">Data status is not available right now.</div>;
  }

  const s = data.strip;
  const onMap = pathname === "/" && !search.get("view");
  const wanted = search.get("cluster")?.trim().toLowerCase();
  const cluster = s.clusters.find((c) => c.name.toLowerCase() === wanted)?.name ?? null;
  const choose = (value: string | null) => {
    const q = withCareParams(window.location.search, { cluster: value });
    window.history.replaceState(null, "", q ? `/?${q}` : "/");
  };
  const lead = s.noComparison === s.total ? "No hospital has a comparison with usual yet" : `${s.above} of ${s.total} hospitals busier than usual`;
  const options = [{ name: null as string | null, label: "All" }, ...s.clusters.map((c) => ({ name: c.name as string | null, label: c.name }))];

  return (
    <div className="sticky top-0 z-30 border-b border-line bg-surface" data-testid="site-strip" role="region" aria-label="Data overview">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 xl:h-10 xl:flex-row xl:items-center xl:justify-between xl:gap-3">
        <div className="flex h-10 shrink-0 items-center justify-between gap-3">
          <Link href={viewHref("planner")} className="min-w-0 text-xs leading-[15px] text-ink" data-testid="strip-summary">
            <span className="block truncate font-semibold">{lead}</span>
            {s.week ? <span className="block truncate text-muted">week of {s.week}</span> : null}
          </Link>
          <button type="button" aria-expanded={open} aria-controls={panel} onClick={() => setOpen(!open)} data-testid="strip-details"
                  className="inline-flex h-7 shrink-0 items-center rounded-md border border-line px-2.5 text-xs font-medium text-ink hover:border-accent xl:hidden">
            Details <span aria-hidden="true">&nbsp;{open ? "▴" : "▾"}</span>
          </button>
        </div>
        <div id={panel} data-testid="strip-panel"
             className={`${open ? "flex" : "hidden"} max-h-[60vh] flex-col gap-2 overflow-y-auto pb-2 xl:flex xl:max-h-none xl:flex-row xl:items-center xl:gap-3 xl:overflow-visible xl:pb-0`}>
          {s.pills.map((p) => <Pill key={p.id} pill={p} />)}
          {onMap ? (
            <div role="group" aria-label="Show hospitals from" className="flex flex-wrap items-center gap-1.5" data-testid="strip-clusters">
              {options.map((c) => {
                const on = cluster === c.name;
                return (
                  <button key={c.label} type="button" aria-pressed={on} onClick={() => choose(c.name)} data-cluster={c.name ?? "all"}
                          className={`${CHIP} ${on ? "border-accent bg-accent text-surface" : "border-line bg-surface text-ink hover:border-accent"}`}>
                    {on ? <span aria-hidden="true">✓&nbsp;</span> : null}{c.label}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
