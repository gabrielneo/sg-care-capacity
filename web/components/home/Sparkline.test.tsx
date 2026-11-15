import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Sparkline } from "./Sparkline";

const vals = [5, 5.5, 6, null, 7, 7.5, 8, 8, 9, 9, 10, 11];

describe("Sparkline", () => {
  it("is hidden from screen readers, with the usual band, a 1.5px line and a status-coloured last dot", () => {
    render(<Sparkline values={vals} tone="higher" band={[6, 8]} />);
    const svg = screen.getByTestId("sparkline");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg.getAttribute("viewBox")).toBe("0 0 96 28");
    expect(svg.querySelector("path")).toHaveAttribute("stroke-width", "1.5");
    expect(screen.getByTestId("sparkline-band")).toHaveClass("fill-sunken");
    expect(screen.getByTestId("sparkline-dot")).toHaveClass("fill-status-higher");
  });
  it("breaks the line at a missing week", () => {
    render(<Sparkline values={vals} tone="usual" />);
    expect((screen.getByTestId("sparkline").querySelector("path")!.getAttribute("d")!.match(/M/g) ?? []).length).toBe(2);
  });
  it("has no dot when the last week is missing, and nothing to draw without values", () => {
    const { unmount } = render(<Sparkline values={[...vals.slice(0, 11), null]} tone="usual" />);
    expect(screen.queryByTestId("sparkline-dot")).toBeNull();
    unmount();
    render(<Sparkline values={[]} tone="none" />);
    expect(screen.queryByTestId("sparkline")).toBeNull();
  });
});
