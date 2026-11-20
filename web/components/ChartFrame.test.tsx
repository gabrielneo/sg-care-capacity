import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { clinicMeta, edMeta as meta } from "@/test/fixtures/meta";

import { ChartFrame } from "./ChartFrame";

const NOW = new Date("2026-11-06T12:00:00+08:00");
const base = { title: "Bed waits", meta, now: NOW, summary: "A line chart of bed waits.", csv: "/export/x.csv?context=1", table: <table><tbody><tr><td>1</td></tr></tbody></table> };

afterEach(() => vi.restoreAllMocks());

describe("ChartFrame", () => {
  it("shows the chart, a closed table behind 'Show as table', a CSV link, and its own date and source", () => {
    render(<ChartFrame {...base} caveat="A plain caveat."><p>chart</p></ChartFrame>);
    expect(screen.getByRole("heading", { name: "Bed waits" })).toBeInTheDocument();
    expect(screen.getByText("chart")).toBeInTheDocument();
    expect((screen.getByTestId("chart-table") as HTMLDetailsElement).open).toBe(false);
    expect(screen.getByText("Show as table")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Download CSV" });
    expect(link).toHaveAttribute("href", "/export/x.csv?context=1");
    expect(link).toHaveAttribute("download");
    // The line in view is the date and source only; the caveat is the first note under "More about these figures" (20 Nov 2026).
    expect(screen.getByTestId("provenance-line")).toHaveTextContent(/^Data as of 31 Oct 2026 · Source: Ministry of Health \(MOH\)$/);
    expect(screen.getByText(/More about these figures/).closest("details")).toHaveTextContent("A plain caveat.");
    // The freshness pill leaves out the date the line already gives; the date stays in its tooltip (review, open item 5).
    expect(screen.getByTestId("freshness-badge")).toHaveTextContent(/^Up to date · weekly$/);
    expect(screen.getByTestId("freshness-badge").getAttribute("title")).toMatch(/^As of 31 Oct 2026\. /);
    expect(screen.getByTestId("chart-frame")).toHaveAttribute("data-provenance", "own");
  });

  it("puts the freshness pill and 'More about these figures' in one row, under the line", () => {
    const own = { ...meta, dq_warnings: [] };
    render(<ChartFrame {...base} meta={own} notes={["A note."]}><p>chart</p></ChartFrame>);
    const badge = screen.getByTestId("freshness-badge");
    const more = screen.getByText(/More about these figures/).closest("details")!;
    expect(badge.parentElement).toBe(more.parentElement);
    expect(badge.parentElement!.previousElementSibling).toBe(screen.getByTestId("provenance-line"));
    // The downloads share that row: a chart's footer is two rows (the line, then badge, notes and downloads).
    expect(screen.getByTestId("chart-downloads").parentElement).toBe(badge.parentElement);
  });

  it("is described by its summary, which is not shown", () => {
    render(<ChartFrame {...base}><p>chart</p></ChartFrame>);
    expect(screen.getByRole("region", { name: "Bed waits" })).toHaveAccessibleDescription("A line chart of bed waits.");
  });

  it("inside a section with the same date and sources it adds no line of its own, only its caveat", () => {
    render(<ChartFrame {...base} section={meta} caveat="A plain caveat."><p>chart</p></ChartFrame>);
    expect(screen.queryByTestId("provenance-line")).toBeNull();
    expect(screen.getByTestId("provenance-inherited").querySelector("details")).toHaveTextContent("A plain caveat.");
    expect(screen.getByTestId("chart-frame")).toHaveAttribute("data-provenance", "section");
  });

  it("inside a section it still offers its own data-quality warnings, with no second date line (review N1)", () => {
    const w = { check_id: "x.moh", table: "moh_bed_waits", severity: "WARN", scope: "row", failing_rows: 1, details: null };
    const own = { ...meta, dq_warnings: [w] } as typeof meta;
    render(<ChartFrame {...base} meta={own} section={meta}><p>chart</p></ChartFrame>);
    expect(screen.getByTestId("chart-frame")).toHaveAttribute("data-provenance", "section");
    expect(screen.queryByTestId("provenance-line")).toBeNull();
    expect(screen.queryByText(/as of 31 Oct 2026/)).toBeNull();                                   // no freshness pill either
    expect(screen.getByTestId("provenance-inherited")).toHaveTextContent("1 data-quality warning applies to these figures.");
  });

  it("inside a section with nothing of its own to add, its footer is only the downloads", () => {
    const clean = { ...meta, dq_warnings: [] };                                // the sample meta carries one warning
    render(<ChartFrame {...base} meta={clean} section={clean}><p>chart</p></ChartFrame>);
    const footer = screen.getByTestId("provenance-inherited");
    expect(footer.querySelector("details")).toBeNull();
    expect(screen.queryByTestId("provenance-line")).toBeNull();
    expect(within(footer).getByTestId("chart-downloads")).toBeInTheDocument();
  });

  it("inside a section whose date differs it shows its own line", () => {
    render(<ChartFrame {...base} section={{ ...meta, as_of: "2026-10-24" }}><p>chart</p></ChartFrame>);
    expect(screen.getByTestId("provenance-line")).toHaveTextContent("Data as of 31 Oct 2026");
    expect(screen.getByTestId("chart-frame")).toHaveAttribute("data-provenance", "own");
  });

  it("a table that is another view is a link; a chart that is itself a table has no toggle", () => {
    const { rerender } = render(<ChartFrame {...base} table={{ href: "/access-map?view=table" }}><p>map</p></ChartFrame>);
    expect(screen.getByTestId("chart-table-link")).toHaveAttribute("href", "/access-map?view=table");
    expect(screen.queryByTestId("chart-table")).toBeNull();
    rerender(<ChartFrame {...base} table="self"><p>table</p></ChartFrame>);
    expect(screen.queryByText("Show as table")).toBeNull();
    expect(screen.queryByTestId("chart-table-link")).toBeNull();
  });

  it("refuses to draw without a date or a source, and warns in development", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(<ChartFrame {...base} meta={{ ...meta, sources: [] }}><p>chart</p></ChartFrame>);
    expect(screen.queryByText("chart")).toBeNull();
    expect(screen.queryByTestId("csv-download")).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent("its source is missing");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("is not drawn"));
  });

  it("empty: says there is no data for the period, keeps the date and source, offers no table or CSV", () => {
    render(<ChartFrame {...base} state="empty" stateMessage="Try a longer period."><p>chart</p></ChartFrame>);
    expect(screen.queryByText("chart")).toBeNull();
    expect(screen.getByText("No data for this period")).toBeInTheDocument();
    expect(screen.getByText("Try a longer period.")).toBeInTheDocument();
    expect(screen.getByTestId("provenance-line")).toBeInTheDocument();
    expect(screen.queryByTestId("csv-download")).toBeNull();
    expect(screen.queryByText("Show as table")).toBeNull();
  });

  it("error: a calm message and a Try again link, no figure", () => {
    render(<ChartFrame {...base} state="error" retryHref="/ed-trends?hospital=SGH"><p>chart</p></ChartFrame>);
    expect(screen.queryByText("chart")).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent("This chart couldn't be loaded");
    expect(screen.getByTestId("retry")).toHaveAttribute("href", "/ed-trends?hospital=SGH");
    expect(screen.queryByTestId("provenance-line")).toBeNull();
  });

  it("passes bySource, findingTo and release through to the provenance line", () => {
    const { rerender } = render(<ChartFrame {...base} findingTo="2026-10-25"><p>chart</p></ChartFrame>);
    expect(screen.getByTestId("provenance-line")).toHaveTextContent("This finding uses data to 25 Oct 2026");
    rerender(<ChartFrame {...base} release><p>chart</p></ChartFrame>);
    expect(screen.getByTestId("provenance-line")).toHaveTextContent("(when this data release was checked)");
  });

  it("the skeleton is hidden until it has been loading for a second", async () => {
    const { ChartFrameSkeleton } = await import("./States");
    render(<ChartFrameSkeleton title="Bed waits" />);
    expect(screen.getByTestId("chart-skeleton")).toHaveClass("delay-show");
  });

  // Carried over from ChartCard's tests: nothing the old component did is lost.
  it("bySource gives each publisher its own date and badge (audit H-1)", () => {
    const nuhs = { id: "nuhs_live", name: "NUHS, ED waiting times", url: "https://www.nuhs.edu.sg/", as_of: "2026-11-06T12:01:49",
                   as_of_basis: "NUHS 'Last updated at'", last_fetched_at: null, licence: null };
    render(<ChartFrame {...base} meta={{ ...meta, sources: [nuhs, ...meta.sources] } as typeof meta} bySource><p>chart</p></ChartFrame>);
    expect(screen.getByTestId("provenance-line")).toHaveTextContent(/^Data as of 6 Nov 2026, 12:01 pm SGT \(NUHS\) and 31 Oct 2026 \(MOH\) · Source: /);
    expect(screen.getByText(/^NUHS: Up to date · a reading at one moment$/)).toBeInTheDocument();
  });

  it("names the right publisher, and shows an old irregular list as the latest published, not an alarm", () => {
    render(<ChartFrame {...base} meta={clinicMeta}><p>map</p></ChartFrame>);
    expect(screen.getByTestId("provenance-line")).toHaveTextContent("Data as of 6 Jun 2024 · Source: data.gov.sg");
    expect(screen.getByText(/^Latest published · updated irregularly$/)).toHaveAttribute("data-level", "overdue");
    expect(screen.queryByText(/Overdue/)).toBeNull();
  });

  it("public pages show the site's notes and summarise warnings with a link; the detail view lists the API's own", () => {
    const { unmount } = render(<ChartFrame {...base} notes={["A site note."]}><p>chart</p></ChartFrame>);
    const details = screen.getByText("More about these figures (2)").closest("details")!;
    expect(within(details).getByText("A site note.")).toBeInTheDocument();
    expect(within(details).getByRole("link", { name: "See Data Quality" })).toHaveAttribute("href", "/data-quality");
    expect(details).not.toHaveTextContent("range.bed_wait_over_24h");
    unmount();
    render(<ChartFrame {...base} detail><p>chart</p></ChartFrame>);
    expect(screen.getByText("More about these figures (3)").closest("details")).toHaveTextContent("(63 rows): SGH, 2026-10-20: over 24 hours");
  });

  it("lets the page choose the caveat, or none; it goes under 'More about these figures', never on the line", () => {
    const { rerender } = render(<ChartFrame {...base} caveat="Chosen caveat"><p>c</p></ChartFrame>);
    expect(screen.getByText(/More about these figures/).closest("details")).toHaveTextContent("Chosen caveat");
    expect(screen.getByTestId("provenance-line")).not.toHaveTextContent("Chosen caveat");
    rerender(<ChartFrame {...base} caveat={null}><p>c</p></ChartFrame>);
    expect(screen.queryByText("Chosen caveat")).toBeNull();
    expect(screen.getByTestId("provenance-line")).toHaveTextContent(/Source: Ministry of Health \(MOH\)$/);
  });

  it("on Data Quality (detail) the caveat stays on the line", () => {
    render(<ChartFrame {...base} caveat="Chosen caveat" detail><p>c</p></ChartFrame>);
    expect(screen.getByTestId("provenance-line")).toHaveTextContent(/· Chosen caveat$/);
  });

  it.each([[{ ...meta, as_of: "" }, "its date is missing"], [{ ...meta, as_of: "not a date" }, "its date is missing"], [{ ...meta, sources: [] }, "its source is missing"]])(
    "refuses to show the chart without a date or source (%#)", (bad, reason) => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      render(<ChartFrame {...base} meta={bad}><p>chart</p></ChartFrame>);
      expect(screen.queryByText("chart")).not.toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent(reason);
    });

  it("does not compile without meta, a summary, a CSV or a table choice", () => {
    // @ts-expect-error meta, summary, csv and table are required (checked by `npm run typecheck`)
    const element = <ChartFrame title="No meta">chart</ChartFrame>;
    expect(element).toBeTruthy();
  });

  it("titleHidden keeps the heading for screen readers only", () => {
    render(<ChartFrame {...base} titleHidden><p>chart</p></ChartFrame>);
    expect(screen.getByRole("heading", { name: "Bed waits" })).toHaveClass("sr-only");
  });

  it("offers the same figures as an Excel workbook, and a copy button, beside the CSV", () => {
    render(<ChartFrame {...base}><p>chart</p></ChartFrame>);
    expect(screen.getByTestId("xlsx-download")).toHaveAttribute("href", "/export/x.csv?context=1&format=xlsx");
    expect(screen.getByRole("link", { name: "Download Excel" })).toHaveAttribute("download");
    expect(screen.getByTestId("copy-caption")).toHaveTextContent("Copy with caption");
  });

  it("says 'Download' once, then the formats, and each link's name still names its action (review N2, WCAG 2.5.3)", () => {
    render(<ChartFrame {...base}><p>chart</p></ChartFrame>);
    const csv = screen.getByRole("link", { name: "Download CSV" });
    const xlsx = screen.getByRole("link", { name: "Download Excel" });
    expect(csv).toHaveTextContent(/^CSV$/);
    expect(xlsx).toHaveTextContent(/^Excel$/);
    expect(csv.getAttribute("aria-label")).toContain(csv.textContent!);              // label in name
    expect(xlsx.getAttribute("aria-label")).toContain(xlsx.textContent!);
    expect(screen.getByText("Download")).toHaveAttribute("aria-hidden", "true");      // not read twice
  });

  it("copy with caption puts the title, what it shows, the date and source, and a link on the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<ChartFrame {...base}><p>chart</p></ChartFrame>);
    fireEvent.click(screen.getByTestId("copy-caption"));
    await waitFor(() => expect(screen.getByTestId("copy-status")).toHaveTextContent("Copied"));
    const text = writeText.mock.calls[0]![0] as string;
    expect(text.split("\n").slice(0, 3)).toEqual(["Bed waits", "A line chart of bed waits.", "Data as of 31 Oct 2026 · Source: MOH"]);
    expect(text.split("\n")[3]).toMatch(/#chart-bed-waits$/);
  });

  it("says so when the clipboard is unavailable", async () => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockRejectedValue(new Error("no")) }, configurable: true });
    render(<ChartFrame {...base}><p>chart</p></ChartFrame>);
    fireEvent.click(screen.getByTestId("copy-caption"));
    await waitFor(() => expect(screen.getByTestId("copy-status")).toHaveTextContent("Couldn't copy"));
  });
});
