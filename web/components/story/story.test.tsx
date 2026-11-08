import { act, render, screen, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { insightMeta, storySample } from "@/lib/samples";
import { chartFormat } from "@/lib/story";

import { AnnotatedChart, fromInsightChart, visibleLabels } from "./AnnotatedChart";
import { CountUp } from "./CountUp";
import { DeltaNumber, deltaFromDisplay } from "./DeltaNumber";
import { HighlightPhrase } from "./HighlightPhrase";
import { Scrolly } from "./Scrolly";

const [weekday, anomaly, volume] = storySample as [(typeof storySample)[0], (typeof storySample)[0], (typeof storySample)[0]];

describe("DeltaNumber", () => {
  it("shows the value, unit, comparison, and the change as an arrow and a word", () => {
    render(<DeltaNumber {...deltaFromDisplay(anomaly.display, anomaly.direction)} />);
    const box = screen.getByTestId("delta-number");
    expect(box).toHaveTextContent(/^Average of daily median.*bed wait.*, week of 19–25 Oct 2026/);   // "bed wait" is a glossary term
    expect(box).toHaveTextContent("2.1 hours");
    expect(box).toHaveTextContent("vs 1.4 hours, usual for this hospital");
    const change = screen.getByTestId("delta-change");
    expect(change).toHaveTextContent("▲ higher than usual");
    expect(within(change).getByText("▲")).toHaveAttribute("aria-hidden", "true");
  });

  it("colours by direction, never by the arrow: a rise in bed waits is worse, a rise in clinics is better", () => {
    const { rerender } = render(<DeltaNumber value="2.1" unit="hours" change="up" word="higher than usual" direction="worse" />);
    expect(screen.getByTestId("delta-change")).toHaveClass("text-bad");
    expect(screen.getByTestId("delta-change")).toHaveTextContent("(worse)");
    rerender(<DeltaNumber value="1.40" unit="per 1,000 residents aged 65+" change="up" word="higher than the national rate" direction="better" />);
    expect(screen.getByTestId("delta-change")).toHaveClass("text-ok");
    expect(screen.getByTestId("delta-change")).toHaveTextContent("▲ higher than the national rate (better)");
    rerender(<DeltaNumber value="1.00" unit="per 1,000 residents aged 65+" change="down" word="lower than the national rate" direction="worse" />);
    expect(screen.getByTestId("delta-change")).toHaveClass("text-bad");
    expect(screen.getByTestId("delta-change")).toHaveTextContent("▼ lower than the national rate");
  });

  it("a neutral finding has no colour; no arrow without a change", () => {
    const { rerender } = render(<DeltaNumber {...deltaFromDisplay(weekday.display, weekday.direction)} />);
    expect(screen.getByTestId("delta-change")).toHaveClass("text-ink");
    rerender(<DeltaNumber {...deltaFromDisplay(volume.display, volume.direction)} />);
    expect(screen.getByTestId("delta-change")).toHaveTextContent(/^moderate link$/);
    expect(screen.getByTestId("delta-number")).not.toHaveTextContent("vs");
  });
});

describe("CountUp", () => {
  it("has the final value in the server-rendered HTML, one fixed cell per digit", () => {
    const html = renderToString(<CountUp value="12.7" label="12.7 hours" />);
    expect(html).toContain("12.7 hours");
    render(<CountUp value="12.7" label="12.7 hours" />);
    const root = screen.getByTestId("countup");
    expect(root).toHaveAttribute("data-value", "12.7");
    expect([...root.querySelectorAll(".countup-roll")].map((e) => e.getAttribute("data-digit"))).toEqual(["1", "2", "7"]);
    expect(root.querySelector(".countup-digits")).toHaveAttribute("aria-hidden", "true");
    expect(root.querySelector(".countup-digits")?.textContent).toBe("12.7");
  });
});

describe("HighlightPhrase", () => {
  let observed: { cb: IntersectionObserverCallback; disconnect: ReturnType<typeof vi.fn> } | null = null;
  const reduce = (on: boolean) =>
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: on && q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} }));
  const offscreen = () => vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ top: 5000, bottom: 5020 } as DOMRect);

  beforeEach(() => {
    observed = null;
    vi.stubGlobal("IntersectionObserver", class {
      disconnect = vi.fn();
      constructor(cb: IntersectionObserverCallback) { observed = { cb, disconnect: this.disconnect }; }
      observe() {}
    });
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("is drawn in the server HTML (correct without JavaScript)", () => {
    expect(renderToString(<HighlightPhrase>key phrase</HighlightPhrase>)).toContain('data-state="drawn"');
  });

  it("off screen: waits, then draws once when it scrolls into view", () => {
    reduce(false);
    offscreen();
    render(<HighlightPhrase>key phrase</HighlightPhrase>);
    expect(screen.getByTestId("highlight")).toHaveAttribute("data-state", "waiting");
    act(() => observed!.cb([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(screen.getByTestId("highlight")).toHaveAttribute("data-state", "drawn");
    expect(observed!.disconnect).toHaveBeenCalled();
  });

  it("with reduced motion it never resets", () => {
    reduce(true);
    offscreen();
    render(<HighlightPhrase>key phrase</HighlightPhrase>);
    expect(screen.getByTestId("highlight")).toHaveAttribute("data-state", "drawn");
    expect(observed).toBeNull();
  });
});

describe("AnnotatedChart", () => {
  const chart = (i: typeof weekday, extra = {}) => (
    <AnnotatedChart id={`${i.insight_id}-t`} title="Bed wait" meta={{ ...insightMeta, as_of: i.as_of }} format={chartFormat(i)}
                    {...fromInsightChart(i.chart)} {...extra} />
  );

  it("labels every bar and points one callout arrow at the highlighted bar", () => {
    render(chart(weekday));
    const bars = screen.getAllByTestId("chart-bar");
    expect(bars.map((b) => b.textContent)).toEqual(["9.4", "12.7", "12.6", "10.0", "8.0", "5.0", "4.5"]);
    expect(bars.filter((b) => b.hasAttribute("data-highlight")).map((b) => b.textContent)).toEqual(["12.7"]);
    expect(screen.getAllByTestId("chart-callout-arrow")).toHaveLength(1);
    expect(screen.getByTestId("chart-callout-arrow")).toHaveAttribute("data-target", "tue");
    expect(screen.getByTestId("chart-callout")).toHaveTextContent("Tuesdays: 43% above average");
    expect(screen.getByTestId("chart-reference")).toHaveTextContent("Weekly average: 8.9");
    expect(within(screen.getByTestId("chart-reference")).getByText("Weekly average: 8.9")).toHaveAttribute("text-anchor", "end");
  });

  it("always shows Data as of and the source, and describes itself to screen readers", () => {
    render(chart(anomaly));
    expect(screen.getByTestId("provenance-line")).toHaveTextContent("Data as of 25 Oct 2026 · Source:");
    expect(screen.getByRole("img")).toHaveAccessibleName(/^19–25 Oct 2026: 2\.1 hours\. 24 Aug: 1\.3; .* 19 Oct: 2\.1\.$/);
  });

  it("gives each copy of the same chart its own ids (inline and panel)", () => {
    render(<>{chart(anomaly, { id: "a-inline" })}{chart(anomaly, { id: "a-panel" })}</>);
    const ids = [...document.querySelectorAll("[id]")].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("a missing value is a gap, never zero", () => {
    const gappy = { ...anomaly.chart, points: anomaly.chart.points.map((p, i) => (i === 3 ? { ...p, value: null } : p)) };
    render(<AnnotatedChart id="g" title="t" meta={insightMeta} format={(v) => v.toFixed(1)} {...fromInsightChart(gappy)} />);
    expect(screen.getByTestId("chart-line").querySelectorAll("line")).toHaveLength(6);    // 8 segments minus the 2 touching the gap
    expect(screen.getByTestId("chart-line").querySelectorAll("circle")).toHaveLength(8);
  });

  it("has no legend up to 3 series, and one above that", () => {
    const series = (n: number) => Array.from({ length: n }, (_, k) => ({ key: `s${k}`, label: `Hospital ${k}`, values: [1 + k, 2 + k, 3 + k] }));
    const cats = [{ key: "a", label: "A" }, { key: "b", label: "B" }, { key: "c", label: "C" }];
    const props = { id: "m", title: "t", meta: insightMeta, kind: "line" as const, categories: cats, highlight: ["c"], callout: "c",
                    format: (v: number) => String(v) };
    const { rerender } = render(<AnnotatedChart {...props} series={series(3)} />);
    expect(screen.queryByTestId("chart-legend")).toBeNull();
    expect(screen.getByText("Hospital 2")).toBeInTheDocument();                        // direct end labels instead
    rerender(<AnnotatedChart {...props} id="m2" series={series(4)} />);
    expect(within(screen.getByTestId("chart-legend")).getAllByRole("listitem")).toHaveLength(4);
  });

  it("thins long x axes on phones, keeping the ends and the highlighted point", () => {
    expect(visibleLabels(7, [1]).always.size).toBe(7);
    const nine = visibleLabels(9, [8]);
    expect([...nine.always].sort((a, b) => a - b)).toEqual([0, 3, 6, 8]);
    expect(nine.always.size + nine.wide.size).toBe(9);                             // all 9 from 640 px up
    const long = visibleLabels(26, [17]);
    expect(long.always.has(0) && long.always.has(25) && long.always.has(17)).toBe(true);
    expect(long.always.size + long.wide.size).toBeLessThan(14);
  });

  it("hides the extra labels below 640 px, and keeps the highlighted point's value off the line", () => {
    render(chart(anomaly));
    const labels = screen.getAllByTestId("chart-x-label");
    expect(labels).toHaveLength(9);
    expect(labels.filter((l) => l.getAttribute("class") === "max-sm:hidden").map((l) => l.textContent))
      .toEqual(["31 Aug", "7 Sep", "21 Sep", "28 Sep", "12 Oct"]);
    expect(screen.getByTestId("chart-point-label")).toHaveAttribute("text-anchor", "end");    // left of a point on the right
  });
});

describe("Scrolly", () => {
  let cb: IntersectionObserverCallback | null = null;
  beforeEach(() => {
    vi.stubGlobal("IntersectionObserver", class {
      constructor(c: IntersectionObserverCallback) { cb = c; }
      observe() {}
      disconnect() {}
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("starts on the first step and switches the panel when a step crosses the middle", () => {
    const steps = ["a", "b", "c"].map((k) => ({ key: k, text: <p>step {k}</p>, inlineChart: <p>inline {k}</p>, panelChart: <p>panel {k}</p> }));
    render(<Scrolly steps={steps} />);
    const states = () => screen.getAllByTestId("story-chart").map((s) => s.getAttribute("data-current"));
    expect(states()).toEqual(["true", "false", "false"]);
    expect(screen.getAllByTestId("story-chart")[1]).toHaveAttribute("aria-hidden", "true");
    const third = screen.getAllByTestId("story-step")[2]!;
    act(() => cb!([{ isIntersecting: true, target: third } as unknown as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(states()).toEqual(["false", "false", "true"]);
    expect(screen.getByTestId("scrolly")).toHaveAttribute("data-active", "2");
    expect(screen.getByText("inline b")).toBeInTheDocument();                        // every step keeps its own chart for phones
  });
});
