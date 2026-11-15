"use client";

import { useEffect, useId, useRef, useState } from "react";

import { LEVEL_STYLE, LEVEL_SYMBOL } from "@/components/FreshnessBadge";
import { formatAsOf } from "@/lib/dates";
import type { StripData, StripPill } from "@/lib/strip";

export interface JumpTarget { id: string; label: string; href: string }

function Pill({ pill }: { pill: StripPill }) {
  return (
    <li className={`flex flex-col border px-3 py-2 text-meta leading-snug ${LEVEL_STYLE[pill.level]}`}
        data-testid="strip-pill" data-pill={pill.id} data-level={pill.level}>
      <span className="font-semibold"><span aria-hidden="true">{LEVEL_SYMBOL[pill.level]} </span>{pill.label}</span>
      <span>{pill.dataset} · {pill.source} · {pill.detail}</span>
    </li>
  );
}

/** The sentence on the left: how many full emergency departments are higher than usual, and which week. */
export function stripLead(s: StripData): string {
  const lead = s.noComparison === s.total
    ? "No comparison with usual yet"
    : `${s.above} of ${s.total} emergency departments higher than usual`;
  return s.week ? `${lead} · week of ${s.week}` : lead;
}

/**
 * The 40px bar that follows a Planner or Analyst reader down the page. It is for those two views only, from 768px up (below
 * that it is not in the page at all), and it stays out of sight until the page's intro (the element marked
 * data-strip-sentinel) has scrolled away. Fixed to the top of the window, so showing it moves nothing.
 *
 * Left: the count and the week, as plain text (it is not a link). Right: how fresh the bed-wait data is, in a symbol and words, which
 * opens each dataset's own date (the NUHS estimates have their own timestamp); and "Jump to section", which lists the view's sections.
 * The count is built on the server from the same statuses as the cards (lib/strip.ts), so it can't disagree with them.
 */
export function SiteStrip({ strip, targets }: { strip: StripData; targets: readonly JumpTarget[] }) {
  const [past, setPast] = useState(false);
  const [open, setOpen] = useState<"fresh" | "jump" | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const freshButton = useRef<HTMLButtonElement>(null);
  const jumpButton = useRef<HTMLButtonElement>(null);
  const freshPanel = useId();
  const jumpPanel = useId();

  // Show the bar once the intro has scrolled out of view above the window.
  useEffect(() => {
    const sentinel = document.querySelector("[data-strip-sentinel]");
    if (!sentinel || typeof IntersectionObserver === "undefined") return;
    const watch = new IntersectionObserver(([entry]) => {
      if (!entry) return;
      const scrolledPast = !entry.isIntersecting && entry.boundingClientRect.bottom < 0;
      setPast(scrolledPast);
      if (!scrolledPast) setOpen(null);
    });
    watch.observe(sentinel);
    return () => watch.disconnect();
  }, []);

  // Esc closes the open list and puts focus back on its button; a click elsewhere closes it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      (open === "fresh" ? freshButton : jumpButton).current?.focus();
      setOpen(null);
    };
    const onDown = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(null); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); };
  }, [open]);

  const bed = strip.pills.find((p) => p.id === "bed");
  const toggle = (which: "fresh" | "jump") => setOpen(open === which ? null : which);

  return (
    <div ref={root} data-testid="site-strip" data-shown={past} role="region" aria-label="Data overview"
         className={`fixed inset-x-0 top-0 z-30 strip-h border-b border-line bg-surface ${past ? "hidden md:block" : "hidden"}`}>
      <div className="mx-auto flex h-full max-w-6xl items-center justify-between gap-4 px-4">
        <p className="min-w-0 truncate text-small text-ink" data-testid="strip-summary">
          <span className="font-semibold">{stripLead(strip)}</span>
        </p>
        <div className="relative flex shrink-0 items-center gap-2">
          {bed ? (
            <>
              <button type="button" ref={freshButton} aria-expanded={open === "fresh"} aria-controls={freshPanel} onClick={() => toggle("fresh")}
                      data-testid="strip-freshness" data-level={bed.level}
                      className="inline-flex min-h-8 items-center gap-2 rounded-md px-2 text-meta font-semibold text-ink hover:bg-page">
                <span aria-hidden="true">{LEVEL_SYMBOL[bed.level]}</span>
                {bed.source} data: {bed.label}
                <span className="hidden font-normal text-muted lg:inline">· as of {formatAsOf(bed.asOf)}</span>
              </button>
              <ul id={freshPanel} hidden={open !== "fresh"} data-testid="strip-panel"
                  className="absolute right-0 top-full z-40 mt-1 w-max max-w-96 space-y-2 rounded-md border border-line bg-surface p-3 shadow-popover">
                {strip.pills.map((p) => <Pill key={p.id} pill={p} />)}
              </ul>
            </>
          ) : null}
          {targets.length ? (
            <>
              <button type="button" ref={jumpButton} aria-expanded={open === "jump"} aria-controls={jumpPanel} onClick={() => toggle("jump")}
                      data-testid="strip-jump"
                      className="inline-flex min-h-8 items-center gap-1 rounded-md border border-control bg-surface px-3 text-meta font-semibold text-ink hover:border-accent">
                Jump to section <span aria-hidden="true">{open === "jump" ? "▴" : "▾"}</span>
              </button>
              <ul id={jumpPanel} hidden={open !== "jump"} data-testid="strip-jump-list"
                  className="absolute right-0 top-full z-40 mt-1 w-max min-w-56 rounded-md border border-line bg-surface py-1 shadow-popover">
                {targets.map((t) => (
                  <li key={t.id}>
                    <a href={t.href} onClick={() => setOpen(null)} className="flex min-h-9 items-center px-3 text-small text-ink link-quiet hover:bg-page">{t.label}</a>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
