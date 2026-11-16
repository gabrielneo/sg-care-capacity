"use client";

import { type CSSProperties, type ElementType, type ReactNode, useEffect, useRef } from "react";

/**
 * Lets a block rise into place the first time it scrolls into view (landing page only).
 *
 * Nothing is hidden by the server or without JavaScript: the block is plain and visible until the page has loaded in the
 * browser, and only blocks that start below the fold are then "armed" (hidden, a little low) and shown as they arrive. A
 * block already on screen is never hidden. With reduced motion, the block is left alone; in print everything is shown
 * (app/globals.css). A fail-safe shows every armed block after 6 seconds, so data is never left hidden.
 */
const FAILSAFE_MS = 6000;

export function Reveal({ children, as: Tag = "div", delay = 0, className, style, ...rest }: {
  children: ReactNode; as?: ElementType; delay?: number; className?: string; style?: CSSProperties; "data-testid"?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches || typeof IntersectionObserver === "undefined") return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return;       // already in view: left as it is
    el.dataset.reveal = "armed";
    const show = () => { el.dataset.reveal = "in"; };
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { show(); io.disconnect(); }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    io.observe(el);
    const failsafe = window.setTimeout(show, FAILSAFE_MS);
    return () => { io.disconnect(); window.clearTimeout(failsafe); };
  }, []);
  return (
    <Tag ref={ref} data-reveal="" className={className} style={{ ...style, ["--delay" as string]: `${delay}ms` }} {...rest}>
      {children}
    </Tag>
  );
}
