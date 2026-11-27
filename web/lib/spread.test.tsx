import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SpreadChart, SpreadTable } from "@/components/edcharts/SpreadChart";

import type { EdDay, Hospital } from "./api/types";
import { SPREAD_MIN_DAYS, skewSentence, spreads } from "./spread";

const DAY = 86_400_000;
const date = (k: number) => new Date(Date.parse("2026-05-11T00:00:00Z") + k * DAY).toISOString().slice(0, 10);
const day = (code: string, k: number, v: number | null, complete = true): EdDay => ({
  hospital_code: code, hospital_name: code, report_date: date(k), iso_year: 2026, iso_week: 20, median_wait_hours: v,
  attendances: 300, is_complete_week: complete, wait_source_sha256: "x", attendances_source_sha256: "x", as_of: "2026-11-08",
  as_of_basis: "fetched", wait_qualifier: null } as unknown as EdDay);
const hospital = (code: string, facility_type: "ED" | "UCC" = "ED"): Hospital => ({
  hospital_code: code, hospital_name: code, cluster: "x", facility_type, reported_from: null, coverage_note: null,
  exclusions_note: null, source_url: "https://www.moh.gov.sg/", as_of: "2026-11-06", as_of_basis: "reference_checked" });

// 40 days of 1..40 hours: easy quantiles. One long day (day 39 = 40 h) pulls the average above the middle once the rest are short.
const ramp = Array.from({ length: 40 }, (_, k) => day("SGH", k, k + 1));

describe("spreads", () => {
  it("gives each hospital's quantiles (type 7), middle day, average and longest day, from complete weeks in the window only", () => {
    const [s] = spreads([...ramp, day("SGH", 5, 99, false), day("SGH", 60, 99)], ["SGH"], date(0), date(45));
    expect(s).toMatchObject({ code: "SGH", n: 40, p10: 4.9, p25: 10.75, median: 20.5, p75: 30.25, p90: 36.1, max: 40, maxDate: date(39), mean: 20.5 });
  });

  it("leaves out a hospital with too few days", () => {
    expect(spreads(ramp.slice(0, SPREAD_MIN_DAYS - 1), ["SGH"], date(0), date(45))).toEqual([]);
  });

  it("says how many averages sit above the middle day", () => {
    const skewed = spreads([...Array.from({ length: 39 }, (_, k) => day("CGH", k, 4)), day("CGH", 39, 30)], ["CGH"], date(0), date(45));
    expect(skewSentence(skewed)).toMatch(/^At 1 of 1 hospital, the average of the daily figures is above the middle day/);
    expect(skewSentence([])).toBeNull();
  });
});

describe("SpreadChart", () => {
  it("draws the full EDs by middle day, the urgent care centre apart, and the same figures as a table", () => {
    const rows = spreads([...ramp, ...Array.from({ length: 40 }, (_, k) => day("AH", k, 1 + k / 10)),
                          ...Array.from({ length: 40 }, (_, k) => day("CGH", k, 30 + k / 10))], ["SGH", "AH", "CGH"], date(0), date(45));
    const hospitals = [hospital("SGH"), hospital("AH", "UCC"), hospital("CGH")];
    render(<SpreadChart rows={rows} hospitals={hospitals} />);
    expect(screen.getAllByTestId("spread-row").map((r) => r.getAttribute("data-hospital"))).toEqual(["CGH", "SGH", "AH"]);
    expect(screen.getByText(/Urgent care centre: compared only with itself/)).toBeInTheDocument();
    expect(screen.getByTestId("spread-sentence")).toHaveTextContent(/^At \d of 2 hospitals/);         // the urgent care centre isn't counted
    render(<SpreadTable rows={rows} hospitals={hospitals} />);
    expect(screen.getAllByRole("row")).toHaveLength(4);
  });
});
