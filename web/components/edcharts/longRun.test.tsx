import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { EdWeek, Hospital, InsightTest } from "@/lib/api/types";
import { insightMeta } from "@/lib/samples";
import type { WeekGrid } from "@/lib/unusualWeeks";

import { HospitalLongRun } from "./HospitalLongRun";
import { Scatter } from "./Scatter";
import { runs, UnusualWeeks, UnusualWeeksTable } from "./UnusualWeeks";

const hospital = (code: string, facility_type: "ED" | "UCC" = "ED"): Hospital => ({
  hospital_code: code, hospital_name: code, cluster: "x", facility_type, reported_from: null, coverage_note: null,
  exclusions_note: null, source_url: "https://www.moh.gov.sg/", as_of: "2026-11-06", as_of_basis: "reference_checked" });

describe("UnusualWeeks", () => {
  const grid: WeekGrid = {
    weeks: ["2025-12-22", "2025-12-29", "2026-01-05"],
    rows: [{ code: "SGH", levels: ["usual", "much_higher", "unknown"], byZ: [true, true, null] },
           { code: "AH", levels: ["lower", "usual", "usual"], byZ: [true, true, true] }],
  };

  it("draws the full EDs, then the urgent care centre apart, with every marked week in the table", () => {
    render(<UnusualWeeks grid={grid} hospitals={[hospital("SGH"), hospital("AH", "UCC")]} />);
    expect(screen.getAllByTestId("week-row").map((r) => r.getAttribute("data-hospital"))).toEqual(["SGH", "AH"]);
    expect(screen.getByText(/Urgent care centre: compared only with itself/)).toBeInTheDocument();
    const sgh = screen.getAllByTestId("week-row")[0]!;
    expect([...sgh.querySelectorAll("rect")].map((r) => r.getAttribute("data-level"))).toEqual(["usual", "much_higher"]);   // a gap draws nothing
    expect(runs(["usual", "usual", "higher", "usual", "unknown", "unknown"]).map((r) => `${r.level}:${r.length}`))
      .toEqual(["usual:2", "higher:1", "usual:1", "unknown:2"]);
    // The tally counts the full EDs only: SGH's 2 judged weeks, 1 much higher.
    expect(screen.getByTestId("week-tally")).toHaveTextContent("Of 2 hospital-weeks with enough history for the 26-week rule, 50% were higher than usual (50% much higher) and 0% lower.");
    expect(screen.getByText("2025")).toBeInTheDocument();
    expect(screen.getByText("2026")).toBeInTheDocument();
  });

  it("lists only the marked weeks in its table", () => {
    render(<UnusualWeeksTable grid={grid} hospitals={[hospital("SGH"), hospital("AH", "UCC")]} />);
    expect(screen.getAllByRole("row")).toHaveLength(3);          // a header and two marked weeks
  });
});

describe("Scatter", () => {
  it("draws one dot per pair, with 0 on both axes and no fitted line", () => {
    render(<Scatter points={[{ date: "2026-10-01", x: -20, y: -0.4 }, { date: "2026-10-02", x: 25, y: 0.6 }]} xLabel="x" yLabel="y" summary="s" />);
    const svg = screen.getByTestId("scatter");
    expect(screen.getByTestId("scatter-dots").querySelectorAll("circle")).toHaveLength(2);
    expect(svg.querySelectorAll("path")).toHaveLength(0);
    expect([...svg.querySelectorAll("text")].map((t) => t.textContent)).toContain("0");
  });
});

describe("HospitalLongRun", () => {
  const DAY = 86_400_000;
  const start = (k: number) => new Date(Date.parse("2026-01-05T00:00:00Z") + k * 7 * DAY).toISOString().slice(0, 10);
  const weekly: EdWeek[] = Array.from({ length: 30 }, (_, k) => ({
    hospital_code: "SGH", hospital_name: "SGH", iso_year: 2026, iso_week: k + 1, week_start: start(k), week_end: start(k),
    mean_of_daily_median_wait_hours: 4 + (k % 3) / 10, total_attendances: null, days_reported_wait: 7, days_reported_attendances: 7,
    is_complete_week: true, source_sha256: "x", as_of: "2026-10-31", as_of_basis: "fetched" }));
  const test = (o: Partial<InsightTest>): InsightTest => ({
    type: "trend", entity: "SGH", variant: "rising", n: 26, n_unit: "weeks", when: null, effect_size: 0.1, metric_value: 0.01, unit: "hours per week",
    ci_low: -0.02, ci_high: 0.04, ci_null: 0, p_value: 0.5, p_adjusted: 0.6, outcome: "effect below the detector's minimum", pairs: null, ...o });

  it("shows every week with the trend test's 26 weeks shaded and its result in words; the scatter only for a published link", () => {
    const tests = [test({}), test({ type: "volume_vs_wait", when: "the day after", metric_value: 0.31, ci_low: 0.16, ci_high: 0.44, outcome: "published",
                                    pairs: [["2026-10-01", -20, -0.4], ["2026-10-02", 25, 0.6]] })];
    render(<HospitalLongRun code="SGH" name="Singapore General Hospital" weekly={weekly} weeklyMeta={insightMeta} tests={tests} testsMeta={insightMeta} />);
    expect(screen.getByTestId("every-week-shade")).toHaveTextContent("Latest 26 weeks");
    expect(screen.getByTestId("trend-sentence")).toHaveTextContent(/^Over the shaded 26 weeks, the estimated change is \+0\.01 hours a week/);
    expect(screen.getByTestId("scatter-sentence")).toHaveTextContent("Spearman correlation 0.31 (95% range 0.16 to 0.44): an association only");
  });

  it("credits the scatter to the test's own sources, not every source in the list of tests", () => {
    const meta = { ...insightMeta, sources: [...insightMeta.sources, { ...insightMeta.sources[0]!, id: "datagov_chas", name: "data.gov.sg, CHAS Clinics" }] };
    render(<HospitalLongRun code="SGH" name="SGH" weekly={weekly} weeklyMeta={insightMeta} testsMeta={meta}
                            tests={[test({ type: "volume_vs_wait", when: "the day after", metric_value: 0.31, outcome: "published", source_ids: ["moh_bed_waits"],
                                           pairs: [["2026-10-01", -20, -0.4], ["2026-10-02", 25, 0.6]] })]} />);
    const frames = screen.getAllByTestId("chart-frame");
    expect(frames.at(-1)).not.toHaveTextContent(/data\.gov\.sg|CHAS/);
    expect(frames.at(-1)).toHaveTextContent(/Source: .*MOH/);
  });

  it("has no scatter when no link was published", () => {
    render(<HospitalLongRun code="SGH" name="SGH" weekly={weekly} weeklyMeta={insightMeta} tests={[test({})]} testsMeta={insightMeta} />);
    expect(screen.queryByTestId("scatter")).toBeNull();
  });
});
