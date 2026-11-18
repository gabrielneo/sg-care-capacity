import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ChangeBars } from "./ChangeBars";
import { LineChart, niceScale } from "./LineChart";

describe("niceScale", () => {
  it.each([[19.2, 20, 5], [8, 8, 2], [77_841, 80_000, 20_000], [0, 1, 0.25]])("%s -> top %s, step %s", (max, top, step) => {
    expect(niceScale(max)).toEqual({ top, step });
  });
});

describe("LineChart", () => {
  const base = { labels: ["Jan", "Feb", "Mar", "Apr"], unit: "Hours", summary: "A line" };

  it("breaks the line at a missing value instead of joining it", () => {
    render(<LineChart {...base} series={[{ key: "a", label: "A", color: "cat-1", values: [4, 5, null, 6] }]} />);
    const segments = screen.getByTestId("line-series").querySelectorAll("line");
    expect(segments).toHaveLength(1);                         // Jan–Feb only: Mar is missing, Apr is alone
  });

  it("starts the axis at 0, so a line's height is its value", () => {
    render(<LineChart {...base} series={[{ key: "a", label: "A", color: "cat-1", values: [4, 4, 4, 4] }]} />);
    expect(screen.getByTestId("line-chart").textContent).toContain("0");
  });

  it("says so when there is nothing complete to draw", () => {
    render(<LineChart {...base} series={[{ key: "a", label: "A", color: "cat-1", values: [null, null, null, null] }]} />);
    expect(screen.getByTestId("line-chart-empty")).toHaveTextContent("No complete months");
  });

  it("labels each line at its end and names the chart for screen readers", () => {
    render(<LineChart {...base} series={[{ key: "y", label: "2026", color: "cat-1", values: [4, 5, null, null], strong: true }]} />);
    expect(screen.getByTestId("line-chart")).toHaveAttribute("aria-label", "A line");
    expect(screen.getByText("2026")).toBeInTheDocument();
  });
});

describe("ChangeBars", () => {
  const base = { labels: ["a", "b", "c", "d"], unit: "%", summary: "Bars" };

  it("draws no bar for a missing change, never a zero bar", () => {
    render(<ChangeBars {...base} values={[10, null, -5, null]} tone="wait" />);
    expect(screen.getAllByTestId("change-bar").map((b) => b.getAttribute("data-value"))).toEqual(["10", "-5"]);
  });

  it("a longer wait and a shorter wait use different colours; visits use one", () => {
    const { unmount } = render(<ChangeBars {...base} values={[10, -5]} labels={["a", "b"]} tone="wait" />);
    const [up, down] = screen.getAllByTestId("change-bar");
    expect(up!.getAttribute("fill")).not.toBe(down!.getAttribute("fill"));
    unmount();
    render(<ChangeBars {...base} values={[10, -5]} labels={["a", "b"]} tone="visits" />);
    const [a, b] = screen.getAllByTestId("change-bar");
    expect(a!.getAttribute("fill")).toBe(b!.getAttribute("fill"));
  });

  it("explains an empty chart in words", () => {
    render(<ChangeBars {...base} values={[null, null, null, null]} tone="wait" />);
    expect(screen.getByTestId("change-bars-empty")).toBeInTheDocument();
  });
});

describe("exact values on hover", () => {
  it("a line chart has one column per month, each with the month in full and every series' value (or a gap said in words)", () => {
    render(<LineChart labels={["Jan", "Feb", "Mar"]} titles={["January", "February", "March"]} unit="h" summary="s" format={(v) => `${v.toFixed(1)} hours`}
                      series={[{ key: "2025", label: "2025", color: "cat-2", values: [2.5, null, 3] },
                               { key: "2026", label: "2026", color: "cat-1", values: [2.94, 2.1, 2.2], strong: true }]} />);
    const bands = screen.getAllByTestId("hover-band");
    expect(bands).toHaveLength(3);
    expect(bands[0]).toHaveTextContent("January20252.5 hours20262.9 hours");
    expect(bands[1]).toHaveTextContent("February2025no complete month20262.1 hours");
    expect(screen.getByTestId("line-chart-hover")).toHaveAttribute("aria-hidden", "true");   // the table is the accessible route
  });

  it("a bar chart says each month's change, signed, and a missing month in words", () => {
    render(<ChangeBars labels={["Jan 26", "Feb 26"]} titles={["Jan 2026", "Feb 2026"]} values={[33.6, null]} tone="wait" unit="%" summary="s" />);
    const tips = screen.getAllByTestId("hover-tip");
    expect(tips[0]).toHaveTextContent("Jan 2026+33.6% on a year before");
    expect(tips[1]).toHaveTextContent("Feb 2026no figure: not complete in both years");
  });
});
