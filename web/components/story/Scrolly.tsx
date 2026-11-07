"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

export interface ScrollyStep {
  key: string;
  /** The step's text (server-rendered). */
  text: ReactNode;
  /** Its chart under the text, on phones and tablets (and without JavaScript). */
  inlineChart: ReactNode;
  /** Its chart in the sticky panel, on desktop. */
  panelChart: ReactNode;
}

/**
 * Scrollytelling: text steps on the left, a sticky chart panel on the right that shows one state
 * per step. Below the lg breakpoint there is no sticky panel: each step's chart sits under its text.
 *
 * Step detection uses IntersectionObserver: the browser reports when a step crosses the middle of
 * the viewport, with no scroll listener running on every frame. The panel's states are all
 * server-rendered and stacked; CSS fades between them (opacity and transform, 300 ms, ease-out;
 * instant with prefers-reduced-motion). Without JavaScript the inline charts are shown instead.
 */
export function Scrolly({ steps }: { steps: ScrollyStep[] }) {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.step));
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },          // the step crossing the middle tenth of the viewport
    );
    for (const el of refs.current) if (el) io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div className="scrolly lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-10" data-testid="scrolly" data-active={active}>
      <ol className="space-y-8 lg:space-y-0">
        {steps.map((s, i) => (
          <li
            key={s.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            data-step={i}
            data-current={i === active}
            data-testid="story-step"
            className="story-step"
          >
            {s.text}
            <div className="story-inline mt-4">{s.inlineChart}</div>
          </li>
        ))}
      </ol>
      <div className="story-panel hidden lg:block" data-testid="story-panel">
        <div className="sticky top-8 grid">
          {steps.map((s, i) => (
            <div
              key={s.key}
              className="story-chart"
              data-state={i}
              data-current={i === active}
              aria-hidden={i !== active}
              inert={i !== active}
              data-testid="story-chart"
            >
              {s.panelChart}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
