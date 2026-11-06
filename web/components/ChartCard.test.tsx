import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { clinicMeta, edMeta } from "@/test/fixtures/meta";

import { ChartCard } from "./ChartCard";

const NOW = new Date("2026-11-06T12:00:00+08:00");

describe("ChartCard", () => {
  it("always shows 'Data as of {date} · Source: {publisher} · {caveat}' under the chart", () => {
    render(<ChartCard title="Bed waits" meta={edMeta} now={NOW}><p>chart</p></ChartCard>);
    expect(screen.getByRole("heading", { name: "Bed waits" })).toBeInTheDocument();
    expect(screen.getByText("chart")).toBeInTheDocument();
    expect(screen.getByTestId("provenance-line")).toHaveTextContent(
      "Data as of 31 Oct 2026 · Source: MOH · Average of daily median ward-bed waits (week): Not a weekly median: MOH publishes daily medians only.");
    const source = screen.getByRole("link", { name: "MOH" });
    expect(source).toHaveAttribute("href", edMeta.sources[0]!.url);
    expect(screen.getByText(/Up to date · 6 days old/)).toBeInTheDocument();
  });

  it("names the right publisher for each dataset, and flags an old one", () => {
    render(<ChartCard title="Clinics" meta={clinicMeta} now={NOW}><p>map</p></ChartCard>);
    expect(screen.getByTestId("provenance-line")).toHaveTextContent("Data as of 6 Jun 2024 · Source: data.gov.sg");
    expect(screen.getByText(/Old · 2 years old/)).toHaveAttribute("data-level", "red");
  });

  it("lists every other caveat and data-quality note behind 'All notes'", () => {
    render(<ChartCard title="Bed waits" meta={edMeta} now={NOW}><p>chart</p></ChartCard>);
    const details = screen.getByText("All notes (2)").closest("details")!;
    expect(within(details).getByText("AH: Urgent Care Centre, not a full ED.")).toBeInTheDocument();
    expect(within(details).getByText(/range.bed_wait_over_24h/)).toBeInTheDocument();
    expect(details).toHaveTextContent("(63 rows): SGH, 2026-10-20: over 24 hours");
  });

  it("lets the page choose the footer caveat, or none", () => {
    const { rerender } = render(<ChartCard title="x" meta={edMeta} caveat="Chosen caveat" now={NOW}>c</ChartCard>);
    expect(screen.getByTestId("provenance-line")).toHaveTextContent(/· Chosen caveat$/);
    rerender(<ChartCard title="x" meta={edMeta} caveat={null} now={NOW}>c</ChartCard>);
    expect(screen.getByTestId("provenance-line")).toHaveTextContent(/Source: MOH$/);
  });

  it.each([
    [{ ...edMeta, as_of: "" }, "its date (as_of) is missing"],
    [{ ...edMeta, as_of: "not a date" }, "its date (as_of) is missing"],
    [{ ...edMeta, sources: [] }, "its source is missing"],
  ])("refuses to show the chart without a date or source (%#)", (meta, reason) => {
    render(<ChartCard title="Bed waits" meta={meta}><p>chart</p></ChartCard>);
    expect(screen.queryByText("chart")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(reason);
  });

  it("does not compile without meta", () => {
    // @ts-expect-error meta is required: provenance can't be skipped (checked by `npm run typecheck`)
    const element = <ChartCard title="No meta">chart</ChartCard>;
    expect(element).toBeTruthy();
  });
});
