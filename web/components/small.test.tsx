import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CaveatChip } from "./CaveatChip";
import { FreshnessBadge } from "./FreshnessBadge";
import { ChartCardSkeleton, EmptyState, ErrorState, Skeleton } from "./States";

describe("FreshnessBadge", () => {
  it.each([
    ["2026-10-31", "green", "Up to date · 6 days old"],
    ["2026-10-20", "amber", "Ageing · 2 weeks old"],
    ["2026-09-01", "red", "Old · 2 months old"],
    ["", "unknown", "Date unknown"],
  ] as const)("%s is %s with a text label", (asOf, level, text) => {
    render(<FreshnessBadge asOf={asOf} cadence="weekly" now={new Date("2026-11-06T12:00:00+08:00")} />);
    const badge = screen.getByText(text);
    expect(badge).toHaveAttribute("data-level", level);
  });
});

describe("states", () => {
  it("CaveatChip labels itself for screen readers", () => {
    render(<CaveatChip tone="warning">63 days over 24 hours</CaveatChip>);
    expect(screen.getByText("Data-quality note:")).toHaveClass("sr-only");
  });
  it("EmptyState shows its message and action", () => {
    render(<EmptyState title="No clinics here" message="Try a wider area." action={<button type="button">Reset</button>} />);
    expect(screen.getByText("No clinics here")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset" })).toBeInTheDocument();
  });
  it("ErrorState is announced and shows the API's code", () => {
    render(<ErrorState error={{ code: "unreachable", message: "The API could not be reached" }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("The API could not be reached(unreachable)");
  });
  it("Skeletons are announced as loading, once", () => {
    render(<><Skeleton /><ChartCardSkeleton title="Bed waits" /></>);
    expect(screen.getAllByRole("status")).toHaveLength(2);
    expect(screen.getByText("Loading Bed waits")).toBeInTheDocument();
  });
});
