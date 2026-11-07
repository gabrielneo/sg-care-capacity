"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

/**
 * A marker underline that draws in once, when the phrase scrolls into view.
 * - The server renders it drawn, so it is correct without JavaScript.
 * - With JavaScript, a phrase that starts off screen is reset and drawn when it scrolls in (a
 *   phrase already on screen stays drawn: no flash). IntersectionObserver, then it disconnects.
 * - Only transform is animated (scaleX), 500 ms, ease-out. prefers-reduced-motion: never reset.
 * For short phrases: the mark sits on one line.
 */
export function HighlightPhrase({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [state, setState] = useState<"drawn" | "waiting">("drawn");

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const box = el.getBoundingClientRect();
    if (box.bottom > 0 && box.top < window.innerHeight) return;          // already visible: leave it drawn
    // The phrase starts off screen: hide the mark until IntersectionObserver says it is in view.
    setState("waiting");
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setState("drawn");
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -15% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <span ref={ref} className="highlight" data-state={state} data-testid="highlight">
      {children}
    </span>
  );
}
