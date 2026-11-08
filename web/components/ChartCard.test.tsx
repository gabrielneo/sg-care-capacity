import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { clinicMeta, edMeta } from "@/test/fixtures/meta";

import { ChartCard } from "./ChartCard";

const NOW = new Date("2026-11-06T12:00:00+08:00");

describe("ChartCard", () => {
  it("always shows 'Data as of {date} · Source: {publisher} · {caveat}' under the chart", () => {
    render(<ChartCard title="Bed waits" meta={edMeta} now={NOW} caveat="A plain caveat."><p>chart</p></ChartCard>);
    expect(screen.getByRole("heading", { name: "Bed waits" })).toBeInTheDocument();
    expect(screen.getByText("chart")).toBeInTheDocument();
    expect(screen.getByTestId("provenance-line")).toHaveTextContent(
      "Data as of 31 Oct 2026 · Source: Ministry of Health (MOH) · A plain caveat.");
    const source = screen.getByRole("link", { name: "Ministry of Health (MOH)" });
    expect(source).toHaveAttribute("href", edMeta.sources[0]!.url);
    expect(screen.getByText(/Up to date · weekly data, 6 days old/)).toBeInTheDocument();
  });

  it("offers the figures as a CSV only when the card has one (S3)", () => {
    const { rerender } = render(<ChartCard title="Bed waits" meta={edMeta} now={NOW}><p>chart</p></ChartCard>);
    expect(screen.queryByTestId("csv-download")).toBeNull();
    rerender(<ChartCard title="Bed waits" meta={edMeta} now={NOW} download="/export/ed-weekly.csv"><p>chart</p></ChartCard>);
    const link = screen.getByRole("link", { name: "Download the figures (CSV)" });
    expect(link).toHaveAttribute("href", "/export/ed-weekly.csv");
    expect(link).toHaveAttribute("download");
  });

  it("offers no CSV when the chart can't be shown", () => {
    render(<ChartCard title="Bed waits" meta={{ ...edMeta, sources: [] }} now={NOW} download="/export/x.csv"><p>chart</p></ChartCard>);
    expect(screen.queryByTestId("csv-download")).toBeNull();
  });

  it("bySource gives each publisher its own date and badge (audit H-1)", () => {
    const nuhs = { id: "nuhs_live", name: "NUHS, ED waiting times", url: "https://www.nuhs.edu.sg/", as_of: "2026-11-06T12:01:49",
                   as_of_basis: "NUHS 'Last updated at'", last_fetched_at: null, licence: null };
    const meta = { ...edMeta, sources: [nuhs, ...edMeta.sources] } as typeof edMeta;
    render(<ChartCard title="NUHS and MOH" meta={meta} now={NOW} cadence="weekly" bySource><p>chart</p></ChartCard>);
    expect(screen.getByTestId("provenance-line")).toHaveTextContent(
      /^Data as of 6 Nov 2026, 12:01 pm SGT \(NUHS\) and 31 Oct 2026 \(MOH\) · Source: /);
    expect(screen.getByText(/^NUHS: Up to date · a live reading/)).toBeInTheDocument();
    expect(screen.getByText(/^MOH: Up to date · weekly data, 6 days old/)).toBeInTheDocument();
  });

  it("findingTo states a finding's data window, while the date and badge stay the source's (audit M-1)", () => {
    render(<ChartCard title="Bed waits" meta={edMeta} now={NOW} findingTo="2026-10-25"><p>chart</p></ChartCard>);
    expect(screen.getByTestId("provenance-line")).toHaveTextContent(
      "Data as of 31 Oct 2026 · Source: Ministry of Health (MOH) · This finding uses data to 25 Oct 2026");
    expect(screen.getByText(/Up to date · weekly data, 6 days old/)).toBeInTheDocument();
  });

  it("names the right publisher for each dataset, and flags an old one", () => {
    render(<ChartCard title="Clinics" meta={clinicMeta} now={NOW}><p>map</p></ChartCard>);
    expect(screen.getByTestId("provenance-line")).toHaveTextContent("Data as of 6 Jun 2024 · Source: data.gov.sg");
    expect(screen.getByText(/Out of date · irregular updates, 2 years old/)).toHaveAttribute("data-level", "red");
  });

  it("public pages show the site's notes and summarise data-quality warnings with a link", () => {
    render(<ChartCard title="Bed waits" meta={edMeta} now={NOW} notes={["A site note."]}><p>chart</p></ChartCard>);
    const details = screen.getByText("More about these figures (2)").closest("details")!;
    expect(within(details).getByText("A site note.")).toBeInTheDocument();
    expect(details).toHaveTextContent("1 data-quality warning applies to these figures. See Data Quality");
    expect(within(details).getByRole("link", { name: "See Data Quality" })).toHaveAttribute("href", "/data-quality");
    expect(details).not.toHaveTextContent("range.bed_wait_over_24h");             // no internal names
    expect(details).not.toHaveTextContent("Not a weekly median");                 // the API's own caveats stay out
  });

  it("the detail view lists the API's caveats and each warning's check", () => {
    render(<ChartCard title="Bed waits" meta={edMeta} now={NOW} detail><p>chart</p></ChartCard>);
    const details = screen.getByText("More about these figures (3)").closest("details")!;
    expect(within(details).getByText("AH: Urgent Care Centre, not a full ED.")).toBeInTheDocument();
    expect(details).toHaveTextContent("(63 rows): SGH, 2026-10-20: over 24 hours");
  });

  it("lets the page choose the footer caveat, or none", () => {
    const { rerender } = render(<ChartCard title="x" meta={edMeta} caveat="Chosen caveat" now={NOW}>c</ChartCard>);
    expect(screen.getByTestId("provenance-line")).toHaveTextContent(/· Chosen caveat$/);
    rerender(<ChartCard title="x" meta={edMeta} caveat={null} now={NOW}>c</ChartCard>);
    expect(screen.getByTestId("provenance-line")).toHaveTextContent(/Source: Ministry of Health \(MOH\)$/);
  });

  it.each([
    [{ ...edMeta, as_of: "" }, "its date is missing"],
    [{ ...edMeta, as_of: "not a date" }, "its date is missing"],
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
