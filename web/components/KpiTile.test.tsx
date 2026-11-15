import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { edMeta } from "@/test/fixtures/meta";

import { KpiTile } from "./KpiTile";

const NOW = new Date("2026-11-06T12:00:00+08:00");

describe("KpiTile", () => {
  it("shows the value, unit, change and provenance", () => {
    render(<KpiTile label="Average bed wait" value={7.8229} unit="hours" meta={edMeta} now={NOW}
                    change={{ value: -5.7, unit: "%", label: "vs the previous 4-week average" }} />);
    expect(screen.getByText("7.8")).toBeInTheDocument();
    expect(screen.getByText("hours")).toBeInTheDocument();
    expect(screen.getByText("-5.7%")).toBeInTheDocument();
    expect(screen.getByText(/vs the previous 4-week average/)).toBeInTheDocument();
    expect(screen.getByTestId("provenance-line")).toHaveTextContent("Data as of 31 Oct 2026 · Source: Ministry of Health (MOH)");
  });

  it("shows missing as missing, never 0", () => {
    render(<KpiTile label="Attendances" value={null} unit="patients" meta={edMeta} now={NOW}
                    change={{ value: null, label: "vs the previous 4-week average" }} />);
    expect(screen.getByText("No data")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    expect(screen.queryByText("patients")).not.toBeInTheDocument();
    expect(screen.getByText(/No comparison available/)).toBeInTheDocument();
  });

  it("refuses to show a number without a date", () => {
    render(<KpiTile label="Average bed wait" value={7.8} meta={{ ...edMeta, as_of: "" }} />);
    expect(screen.queryByText("7.8")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("its date is missing");
  });

  it("does not compile without meta", () => {
    // @ts-expect-error meta is required
    const element = <KpiTile label="x" value={1} />;
    expect(element).toBeTruthy();
  });

  it("provenance={false}: no date or source on the tile (the section states them once), but a bad meta still refuses the figure", () => {
    const { unmount } = render(<KpiTile label="x" value={3} meta={edMeta} provenance={false} />);
    expect(screen.queryByTestId("provenance-line")).toBeNull();
    expect(screen.getByTestId("kpi-tile")).toHaveAttribute("data-provenance", "section");
    unmount();
    render(<KpiTile label="x" value={3} meta={{ ...edMeta, sources: [] }} provenance={false} />);
    expect(screen.queryByText("3")).toBeNull();
  });

  it("href: the label is the link, stretched over the tile, with a hint for a screen reader", () => {
    render(<KpiTile label="Longest bed wait" value={7.8} unit="h" meta={edMeta} provenance={false} href="#hospital-SGH" hrefHint="Show its hospital card" />);
    const link = screen.getByRole("link", { name: "Longest bed wait. Show its hospital card" });
    expect(link).toHaveAttribute("href", "#hospital-SGH");
    expect(screen.getByTestId("kpi-tile")).toHaveClass("kpi-linked");
  });

  it("reserves the micro-visual row only when asked, so tiles in a row are all the same shape", () => {
    const { unmount } = render(<KpiTile label="x" value={3} meta={edMeta} provenance={false} />);
    expect(screen.queryByTestId("kpi-visual")).toBeNull();
    unmount();
    render(<KpiTile label="x" value={3} meta={edMeta} provenance={false} visualRow={<svg />} />);
    expect(screen.getByTestId("kpi-visual")).toBeInTheDocument();
  });
});
