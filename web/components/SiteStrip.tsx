"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";

import { LEVEL_STYLE, LEVEL_SYMBOL } from "@/components/FreshnessBadge";
import { formatAsOf } from "@/lib/dates";
import { viewHref } from "@/lib/homeViews";
import type { StripData, StripPill } from "@/lib/strip";

type Loaded = { ok: true; strip: StripData } | { ok: false };

function Pill({ pill }: { pill: StripPill }) {
  return (
    <span className={`inline-flex min-w-0 flex-col rounded-md border px-2 py-0.5 text-xs leading-[15px] ${LEVEL_STYLE[pill.level]}`}
          data-testid="strip-pill" data-pill={pill.id} data-level={pill.level}>
      <span className="font-semibold"><span aria-hidden="true">{LEVEL_SYMBOL[pill.level]} </span>{pill.label}</span>
      <span>{pill.dataset} · {pill.source} · {pill.detail}</span>
    </span>
  );
}

/**
 * The slim strip under the top bar: how many hospitals are busier than usual, and how fresh each dataset
 * is. The count always carries its source and as-of date in words, on every width (line 2 below 1280px;
 * the bed-wait pill beside it from 1280px): a date that lives only in a tooltip can't be read on a phone or by keyboard. Every pill is dated by its
 * own source and the NUHS estimates say they cover some hospitals only. Below 1280px the pills sit
 * behind "Details". The cluster filter lives with the hospital map (components/home/CareControls.tsx).
 */
export function SiteStrip() {
  const [data, setData] = useState<Loaded | null>(null);
  const [open, setOpen] = useState(false);
  const panel = useId();

  useEffect(() => {
    let live = true;
    fetch("/strip.json")
      .then((r) => r.json() as Promise<Loaded>)
      .then((b) => live && setData(b))
      .catch(() => live && setData({ ok: false }));
    return () => { live = false; };
  }, []);

  if (!data) return <div className="h-[45px] border-b border-line bg-surface" data-testid="site-strip-loading" />;
  if (!data.ok) {
    return <div className="flex h-[45px] items-center border-b border-line bg-surface px-4 text-xs text-muted" data-testid="site-strip">Data status is not available right now.</div>;
  }

  const s = data.strip;
  const lead = s.noComparison === s.total ? "No hospital has a comparison with usual yet" : `${s.above} of ${s.total} hospitals busier than usual`;
  const basis = s.bed ? `${s.bed.source}, data as of ${formatAsOf(s.bed.asOf)}` : null;

  return (
    <div className="sticky top-0 z-30 border-b border-line bg-surface" data-testid="site-strip" role="region" aria-label="Data overview">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 xl:min-h-11 xl:flex-row xl:items-center xl:justify-between xl:gap-3">
        <div className="flex min-h-11 shrink-0 items-center justify-between gap-3">
          <Link href={viewHref("planner")} className="min-w-0 py-1 text-xs leading-[15px] text-ink" data-testid="strip-summary">
            <span className="block font-semibold">{lead}</span>
            {/* One line at every width, so the bar is the same height before and after it loads (no layout shift).
                Wide screens have room for the pills, which carry the source and date, so the second line says the week. */}
            {basis ? <span className="block text-muted xl:hidden" data-testid="strip-basis">{basis}</span> : null}
            {s.week ? <span className="hidden text-muted xl:block" data-testid="strip-week">week of {s.week}</span> : null}
          </Link>
          <button type="button" aria-expanded={open} aria-controls={panel} onClick={() => setOpen(!open)} data-testid="strip-details"
                  className="inline-flex min-h-11 shrink-0 items-center rounded-md px-2.5 text-xs font-medium text-ink underline-offset-2 hover:underline xl:hidden">
            Details <span aria-hidden="true">&nbsp;{open ? "▴" : "▾"}</span>
          </button>
        </div>
        <div id={panel} data-testid="strip-panel"
             className={`${open ? "flex" : "hidden"} max-h-[60vh] flex-col gap-2 overflow-y-auto pb-2 xl:flex xl:max-h-none xl:flex-row xl:items-center xl:gap-3 xl:overflow-visible xl:pb-0`}>
          {s.pills.map((p) => <Pill key={p.id} pill={p} />)}
        </div>
      </div>
    </div>
  );
}
