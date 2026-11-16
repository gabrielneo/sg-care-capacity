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
