"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

/**
 * Below 768px a long section is an accordion, closed until opened (UX audit I2). From 768px it is just the section, always open.
 * The state is in the URL fragment, so a link still works: opening sets `#anchor`, closing clears it, and arriving with `#anchor`
 * (or a fragment that points inside) opens it and scrolls to it. The server renders it open, so without JavaScript nothing is hidden
 * (and print shows everything: .accordion-print in globals.css).
 */
export function MobileAccordion({ anchor, label, children }: { anchor: string; label: string; children: ReactNode }) {
  const [narrow, setNarrow] = useState(false);
  const [open, setOpen] = useState(true);
  const root = useRef<HTMLDivElement>(null);

  const fromHash = useCallback(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    const target = id ? document.getElementById(id) : null;
    return id === anchor || (target != null && root.current != null && root.current.contains(target) && target !== root.current);
  }, [anchor]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 47.99rem)");
    const apply = () => {
      setNarrow(mq.matches);
      if (mq.matches) {
        const want = fromHash();
        setOpen(want);
        if (want) requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView());
      } else setOpen(true);
    };
    apply();
    mq.addEventListener("change", apply);
    const onHash = () => { if (mq.matches && fromHash()) { setOpen(true); requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView()); } };
    window.addEventListener("hashchange", onHash);
    return () => { mq.removeEventListener("change", apply); window.removeEventListener("hashchange", onHash); };
  }, [anchor, fromHash]);

  if (!narrow) return <div ref={root} data-accordion={anchor} data-narrow="false">{children}</div>;
  return (
    <div ref={root} data-accordion={anchor} data-narrow="true">
      <details open={open} className="accordion rounded-xl border border-line bg-surface" data-testid={`accordion-${anchor}`}
               onToggle={(e) => {
                 const now = (e.currentTarget as HTMLDetailsElement).open;
                 setOpen(now);
                 const url = `${window.location.pathname}${window.location.search}`;
                 window.history.replaceState(null, "", now ? `${url}#${anchor}` : url);
               }}>
        <summary className="flex min-h-11 cursor-pointer select-none items-center justify-between gap-3 px-4 font-semibold text-accent">
          <span>{label}</span><span aria-hidden="true" className="accordion-mark" />
        </summary>
        <div className="px-4 pb-4">{children}</div>
      </details>
    </div>
  );
}
