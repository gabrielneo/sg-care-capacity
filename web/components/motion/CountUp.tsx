"use client";

import { useEffect, useRef, useState } from "react";

const DURATION_MS = 1400;
const ease = (t: number) => 1 - (1 - t) ** 3;                    // ease-out: quick start, soft landing

/** A number as the site writes it: thousands separators, fixed decimals, and a sign where asked ("+3%", "−6%"). */
export function formatCount(value: number, decimals = 0, signed = false): string {
  const text = Math.abs(value).toLocaleString("en-SG", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  if (!signed || Number(text) === 0) return text;
  return `${value > 0 ? "+" : "−"}${text}`;
}

/**
 * A figure that counts up from 0 when it first comes into view (landing page only). The server and no-JavaScript show the
 * final figure; screen readers always read the final figure, never a count in progress; reduced motion shows it at once.
 * The width is held by tabular figures and the final text's own width, so the page never shifts as it counts.
 */
export function CountUp({ value, decimals = 0, signed = false, suffix = "" }: { value: number; decimals?: number; signed?: boolean; suffix?: string }) {
  const final = `${formatCount(value, decimals, signed)}${suffix}`;
  // 1 = done (what the server and no-JavaScript show). The browser drops it to 0 on the next frame and counts back up when in view.
  const [progress, setProgress] = useState(1);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = requestAnimationFrame(() => setProgress(0));
    let started = false;
    const run = () => {
      if (started) return;
      started = true;
      const t0 = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - t0) / DURATION_MS);
        setProgress(ease(t));
        if (t < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { io.disconnect(); run(); } }, { threshold: 0.4 });
    io.observe(el);
    const failsafe = window.setTimeout(() => { io.disconnect(); run(); }, 6000);
    return () => { io.disconnect(); cancelAnimationFrame(raf); window.clearTimeout(failsafe); };
  }, [value]);
  const shown = progress >= 1 ? final : `${formatCount(value * progress, decimals, signed && progress > 0)}${suffix}`;
  return (
    <span ref={ref} className="inline-block tabular-nums" style={{ minWidth: `${final.length}ch` }} data-testid="count-up">
      <span aria-hidden="true">{shown}</span>
      <span className="sr-only">{final}</span>
    </span>
  );
}
