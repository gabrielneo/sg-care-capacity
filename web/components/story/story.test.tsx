import { render, screen, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { InsightChart } from "@/lib/api/types";
import { insightMeta, storySample } from "@/lib/samples";
import { chartFormat } from "@/lib/story";

import { AnnotatedChart, fromInsightChart, visibleLabels } from "./AnnotatedChart";
import { DeltaNumber, deltaFromDisplay } from "./DeltaNumber";
import { HighlightPhrase } from "./HighlightPhrase";

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
    // Worse is amber ("higher"); crimson is kept for an explicit "much higher" pill.
    expect(screen.getByTestId("delta-change")).toHaveClass("text-status-higher");
    expect(screen.getByTestId("delta-change")).not.toHaveClass("text-status-much");
    expect(screen.getByTestId("delta-change")).toHaveTextContent("(worse)");
    rerender(<DeltaNumber value="1.40" unit="per 1,000 residents aged 65+" change="up" word="higher than the average rate" direction="better" />);
    expect(screen.getByTestId("delta-change")).toHaveClass("text-status-lower");
    expect(screen.getByTestId("delta-change")).toHaveTextContent("▲ higher than the average rate (better)");
    rerender(<DeltaNumber value="1.00" unit="per 1,000 residents aged 65+" change="down" word="lower than the average rate" direction="worse" />);
    expect(screen.getByTestId("delta-change")).toHaveClass("text-status-higher");
    expect(screen.getByTestId("delta-change")).toHaveTextContent("▼ lower than the average rate");
  });

  it("a neutral finding has no colour; no arrow without a change", () => {
    const { rerender } = render(<DeltaNumber {...deltaFromDisplay(weekday.display, weekday.direction)} />);
    expect(screen.getByTestId("delta-change")).toHaveClass("text-ink");
    rerender(<DeltaNumber {...deltaFromDisplay(volume.display, volume.direction)} />);
    expect(screen.getByTestId("delta-change")).toHaveTextContent(/^moderate link$/);
    expect(screen.getByTestId("delta-number")).not.toHaveTextContent("vs");
  });
});

describe("HighlightPhrase", () => {
  it("is a static mark in the server HTML: no state, no scroll wait (audit D9)", () => {
    const html = renderToString(<HighlightPhrase>key phrase</HighlightPhrase>);
    expect(html).toContain("key phrase");
    expect(html).not.toContain("data-state");
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
    expect(screen.getAllByText("Hospital 2").some((e) => e.tagName.toLowerCase() === "text")).toBe(true);   // direct end labels instead (the table has the name too)
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

  it("on a line, drops the label next to each edge-anchored end, so the ends never overlap a neighbour (review N3)", () => {
    const shown = (l: { always: Set<number>; wide: Set<number> }) => [...l.always, ...l.wide].sort((a, b) => a - b);
    expect(shown(visibleLabels(9, [8], true))).toEqual([0, 2, 3, 4, 5, 6, 8]);       // not 1 or 7
    expect(shown(visibleLabels(5, [], true))).toEqual([0, 2, 4]);
    // A highlighted neighbour wins over the end beside it: its label is the one the callout points at.
    expect(shown(visibleLabels(9, [7], true))).toEqual([0, 2, 3, 4, 5, 6, 7]);
    expect(shown(visibleLabels(9, [8]))).toHaveLength(9);                               // bars: centred, nothing dropped
  });

  it("hides the extra labels below 640 px, and keeps the highlighted point's value off the line", () => {
    render(chart(anomaly));
    const labels = screen.getAllByTestId("chart-x-label");
    expect(labels).toHaveLength(7);                                                  // 31 Aug and 12 Oct sit next to the ends (N3)
    expect(labels.filter((l) => l.getAttribute("class") === "max-sm:hidden").map((l) => l.textContent))
      .toEqual(["7 Sep", "21 Sep", "28 Sep"]);
    expect(screen.getByTestId("chart-point-label")).toHaveAttribute("text-anchor", "end");    // left of a point on the right
  });
});

describe("fromInsightChart: a date axis is in date order (audit A5)", () => {
  it("sorts a line chart's weeks by their dates, whatever order they arrive in", () => {
    const chart = {
      kind: "line", y_label: "Hours", x_label: null, highlight: ["2026-10-19"], callout: "c", reference: null, trend_line: null,
      points: [["2026-09-07", "7 Sep", 3], ["2026-08-31", "31 Aug", 2], ["2026-10-19", "19 Oct", 5], ["2026-09-14", "14 Sep", 4]]
        .map(([key, label, value]) => ({ key, label, value })),
    } as unknown as InsightChart;
    const props = fromInsightChart(chart);
    expect(props.categories.map((c) => c.label)).toEqual(["31 Aug", "7 Sep", "14 Sep", "19 Oct"]);
    expect(props.series[0]!.values).toEqual([2, 3, 4, 5]);       // the values move with their dates
  });
});
