import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CaveatChip } from "./CaveatChip";
import { datasetFreshness } from "@/lib/freshness";

import { FreshnessBadge } from "./FreshnessBadge";
import { ChartFrameSkeleton, EmptyState, ErrorState, Skeleton } from "./States";

describe("FreshnessBadge", () => {
  it.each([
    ["2026-10-31", "up_to_date", "Up to date · weekly · as of 31 Oct 2026"],
    ["2026-10-10", "due", "Due an update · weekly · as of 10 Oct 2026"],
    ["2026-09-01", "overdue", "Overdue · weekly · as of 1 Sept 2026"],
    ["", "unknown", "Date unknown"],
  ] as const)("%s is %s with a text label, the cadence and the date", (asOf, level, text) => {
    const now = new Date("2026-11-06T12:00:00+08:00");
    render(<FreshnessBadge freshness={datasetFreshness("moh_bed_waits", asOf, now)} />);
    expect(screen.getByTestId("freshness-badge")).toHaveTextContent(text);
    expect(screen.getByTestId("freshness-badge")).toHaveAttribute("data-level", level);
  });

  it("judges a meta by the least fresh of its sources", () => {
    const meta = { sources: [{ id: "nuhs_live", as_of: "2026-11-06T08:00:00" }, { id: "moh_bed_waits", as_of: "2026-10-10" }] };
    render(<FreshnessBadge meta={meta as never} now={new Date("2026-11-06T12:00:00+08:00")} />);
    expect(screen.getByTestId("freshness-badge")).toHaveAttribute("data-level", "due");
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
    expect(screen.getByRole("alert")).toHaveTextContent("The API could not be reached(Reference: unreachable)");
  });
  it("Skeletons are announced as loading, once", () => {
    render(<><Skeleton /><ChartFrameSkeleton title="Bed waits" /></>);
    expect(screen.getAllByRole("status")).toHaveLength(2);
    expect(screen.getByText("Loading Bed waits")).toBeInTheDocument();
  });
});
