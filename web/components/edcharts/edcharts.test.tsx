import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Hospital, Insight } from "@/lib/api/types";
import { divergingClasses, type Usual } from "@/lib/edCompare";
import { divergingScale } from "@/lib/palette";

import { Dumbbell } from "./Dumbbell";
import { ModeToggle } from "./ModeToggle";
import { SmallMultiples } from "./SmallMultiples";
import { SlopeChart, spread } from "./SlopeChart";
import { WeekdayHeatmap } from "./WeekdayHeatmap";

const hospital = (code: string, facility_type: "ED" | "UCC" = "ED", coverage_note: string | null = null): Hospital => ({
  hospital_code: code, hospital_name: code, cluster: "x", facility_type, reported_from: null, coverage_note,
  exclusions_note: null, source_url: "https://www.moh.gov.sg/", as_of: "2026-11-06", as_of_basis: "reference_checked" });
const HOSPITALS = [hospital("AH", "UCC"), hospital("NUH", "ED", "Adult emergency department only."), hospital("SGH"), hospital("SKH")];
const usual = (code: string, u: number | null, latest: number | null, weeks = 8): Usual => ({
  code, usual: u, latest, weeks, diff: u != null && latest != null ? latest - u : null,
  pct: u != null && latest != null ? ((latest - u) / u) * 100 : null });
const finding = (type: Insight["type"], entity: string, callout: string, key = "tue") =>
  ({ type, entity, rank_score: 1, chart: { highlight: [key], callout } } as unknown as Insight);

describe("Dumbbell", () => {
  const usuals = { AH: usual("AH", 1.37, 2.14), NUH: usual("NUH", 6, 5.4), SGH: usual("SGH", 8, 8.4), SKH: usual("SKH", null, 9, 7) };

  it("sorts by the size of the difference and labels each row with an arrow and a word", () => {
    render(<Dumbbell usuals={usuals} hospitals={HOSPITALS} mode="usual" finding={null} />);
    const rows = screen.getAllByTestId("dumbbell-row");
    expect(rows.map((r) => r.getAttribute("data-hospital"))).toEqual(["AH", "NUH", "SGH"]);   // +56%, −10%, +5%
    expect(within(rows[0]!).getByTestId("delta-number")).toHaveTextContent("+56%▲ higher than usual (worse)");
    expect(within(rows[1]!).getByTestId("delta-change")).toHaveClass("text-ok");            // a shorter wait is better
    expect(screen.getByTestId("dumbbell-missing")).toHaveTextContent("Sengkang General Hospital (SKH) (7 of 8)");
  });

  it("annotates the unusual-week finding's hospital, and pins the caveats in raw mode", () => {
    render(<Dumbbell usuals={usuals} hospitals={HOSPITALS} mode="raw" finding={finding("anomaly", "AH", "19–25 Oct 2026: 2.1 hours")} />);
    const ah = screen.getAllByTestId("dumbbell-row").find((r) => r.getAttribute("data-hospital") === "AH")!;
    expect(ah).toHaveAttribute("data-annotated");
    expect(within(ah).getByTestId("chart-callout")).toHaveTextContent("19–25 Oct 2026: 2.1 hours");
    expect(within(ah).getByTestId("pinned-caveat")).toHaveTextContent(/not a full/);
    expect(within(ah).getByTestId("delta-number")).toHaveTextContent(/2\.1 hours\s*vs 1\.4 usual/);
  });
});

describe("WeekdayHeatmap", () => {
  const profiles = [{ code: "SKH", values: [5.8, 42.9, 41.7, 12.1, -9.7, -43.2, -49.5], weeks: 26 },
                    { code: "SGH", values: [0, 0, 0, 0, 0, 0, 0], weeks: 26 }];

  it("is centred on 0: a 0% cell is the neutral middle colour and the scale runs −m to +m", () => {
    render(<WeekdayHeatmap profiles={profiles} hospitals={HOSPITALS} mode="usual" finding={null} />);
    const legend = screen.getByTestId("heat-legend");
    expect(Number(legend.getAttribute("data-min"))).toBe(-Number(legend.getAttribute("data-max")));
    const sgh = screen.getAllByTestId("heat-cell").slice(7);
    expect(sgh.every((c) => c.getAttribute("data-color") === divergingScale[3])).toBe(true);
    expect(screen.getAllByTestId("heat-legend-class")[3]).toHaveTextContent("0%");
    expect(divergingClasses(profiles.flatMap((p) => p.values))[3]!.color).toBe(divergingScale[3]);
  });

  it("every cell shows its number, and the peak-day finding's cell is marked", () => {
    render(<WeekdayHeatmap profiles={profiles} hospitals={HOSPITALS} mode="usual" finding={finding("weekday", "SKH", "Tuesdays: 43% above average")} />);
    const cells = screen.getAllByTestId("heat-cell");
    expect(cells[1]).toHaveTextContent("+43%");
    expect(cells[1]).toHaveAttribute("data-annotated");
    expect(screen.getByTestId("chart-callout")).toHaveTextContent("Tuesdays: 43% above average");
    expect(screen.getByRole("table")).toBeInTheDocument();
  });
});

describe("SmallMultiples", () => {
  const days = ["2026-10-01", "2026-10-02", "2026-10-03"];
  const bandPoints = days.map((date) => ({ date, p25: 4, p50: 5, p75: 6 }));

  it("draws one panel per hospital, breaks the line at a missing day and counts it", () => {
    render(<SmallMultiples mode="raw" bandPoints={bandPoints} finding={null} panels={[
      { hospital: HOSPITALS[2]!, missingUsual: null, series: [{ date: days[0]!, value: 4 }, { date: days[1]!, value: null }, { date: days[2]!, value: 6 }] },
      { hospital: HOSPITALS[0]!, missingUsual: null, series: days.map((date) => ({ date, value: 1.3 })) }]} />);
    const [sgh, ah] = screen.getAllByTestId("multiple");
    expect(sgh!.querySelectorAll("[data-testid=series]")).toHaveLength(2);                   // two runs: the gap isn't joined
    expect(within(sgh!).getByTestId("gap-count")).toHaveTextContent("1 day missing");
    expect(within(ah!).getByTestId("pinned-caveat")).toHaveTextContent(/not a full/);       // raw mode pins the UCC caveat
    expect(screen.getByTestId("band-legend")).toHaveTextContent("Middle half of the full emergency departments");
  });

  it("vs usual: a hospital with no usual level says why instead of drawing a line", () => {
    render(<SmallMultiples mode="usual" bandPoints={bandPoints} finding={null} panels={[
      { hospital: HOSPITALS[0]!, missingUsual: "No usual level: 7 of the 8 weeks are complete.", series: [] }]} />);
    expect(screen.getByTestId("multiple")).toHaveTextContent("No usual level: 7 of the 8 weeks are complete.");
    expect(screen.queryByTestId("pinned-caveat")).toBeNull();
  });
});

describe("ModeToggle", () => {
  it("keeps the hospital and date filters when switching", () => {
    render(<ModeToggle mode="usual" params={{ hospital: ["SGH", "AH"], from: "2026-09-01", mode: "usual" }} />);
    expect(screen.getByRole("link", { name: "Raw values across hospitals" }))
      .toHaveAttribute("href", "/ed-trends?hospital=SGH&hospital=AH&from=2026-09-01&mode=raw");
    expect(screen.getByRole("link", { name: "Each against its own usual level" })).toHaveAttribute("aria-current", "page");
  });
});

describe("SlopeChart", () => {
  it("labels both ends, nudges crowded labels apart and says the days and measures differ", () => {
    render(<SlopeChart finding={null} pairs={[
      { code: "NUH", moh: { value: 4.4, date: "2026-10-31" }, nuhs: { value: 20, at: "2026-11-06T12:01:49" } },
      { code: "AH", moh: { value: 1.5, date: "2026-10-31" }, nuhs: null }]} />);
    expect(screen.getAllByTestId("slope")).toHaveLength(1);                                // a site without both is left out
    expect(screen.getByRole("img")).toHaveAccessibleName("NUH: MOH 4.4 hours, NUHS 20.0 hours. Different days and different measures.");
    expect(screen.getByTestId("slope-caveat")).toHaveTextContent(/Different days and different measures/);
    expect(spread([100, 105, 160])).toEqual([100, 113, 160]);
  });
});
