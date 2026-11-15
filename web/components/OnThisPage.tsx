"use client";

import { useEffect, useState } from "react";

export interface RailItem { id: string; label: string }

/**
 * The right-hand "On this page" list (from 1280px; see .rail-layout in globals.css). The entry for the section in view is marked
 * `aria-current="location"` and bold, with a rule beside it: text and shape, not colour alone. Scroll-spy uses one IntersectionObserver
 * on the sections' ids; with no JavaScript it is a plain list of links. An id that isn't on the page is left out of the observer.
 */
export function OnThisPage({ items, className = "" }: { items: readonly RailItem[]; className?: string }) {
  const [active, setActive] = useState<string | null>(items[0]?.id ?? null);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const els = items.flatMap((i) => { const el = document.getElementById(i.id); return el ? [el] : []; });
    if (!els.length) return;
    const visible = new Set<string>();
    const watch = new IntersectionObserver((entries) => {
      for (const e of entries) { if (e.isIntersecting) visible.add(e.target.id); else visible.delete(e.target.id); }
      // The first listed section that is in the band near the top of the window; when none is, keep the last one.
      const first = items.find((i) => visible.has(i.id));
      if (first) setActive(first.id);
    }, { rootMargin: "-10% 0px -70% 0px" });
    els.forEach((el) => watch.observe(el));
    return () => watch.disconnect();
  }, [items]);

  return (
    <nav aria-label="On this page" className={`text-small ${className}`} data-testid="on-this-page">
      <p className="mb-2 font-semibold text-ink">On this page</p>
      <ul className="space-y-1 border-l border-line">
        {items.map((i) => {
          const on = i.id === active;
          return (
            <li key={i.id}>
              <a href={`#${i.id}`} aria-current={on ? "location" : undefined} data-active={on ? "true" : "false"}
                 className={`rail-link ${on ? "font-semibold text-ink" : "text-muted"}`}>{i.label}</a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
