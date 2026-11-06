import { readFileSync } from "node:fs";
import path from "node:path";

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { EdDay, Hospital } from "./api/types";
import { coverageGrid, dateRuns, parseWindow, slugify, windowStart } from "./coverage";
import { renderMarkdown } from "./docs";

const h = (code: string, reported_from: string | null = null): Hospital => ({
  hospital_code: code, hospital_name: code, cluster: "x", facility_type: "ED", reported_from, coverage_note: null,
  exclusions_note: null, source_url: "https://www.moh.gov.sg/", as_of: "2026-11-06", as_of_basis: "reference_checked" });
const d = (code: string, date: string, wait: number | null, att: number | null): EdDay => ({
  hospital_code: code, hospital_name: code, report_date: date, iso_year: 2026, iso_week: 40, median_wait_hours: wait,
  attendances: att, is_complete_week: false, dq_flags: [], wait_source_url: null, wait_source_sha256: null,
  attendance_source_url: null, attendance_source_sha256: null, as_of: "2026-11-06T16:33:44", as_of_basis: "fetched" });

describe("coverage grid", () => {
  it("classifies each hospital-day, and days before reported_from are not gaps", () => {
    const rows = [d("SGH", "2026-10-01", 4, 400), d("SGH", "2026-10-02", 4, null), d("SGH", "2026-10-03", null, 400),
                  d("WH", "2026-10-03", 3, 200)];
    const g = coverageGrid(rows, [h("SGH"), h("WH", "2026-10-03")], "2026-10-01", "2026-10-04");
    expect(g.days).toHaveLength(4);
    expect(g.rows[0]!.cells).toEqual(["both", "wait_only", "attendance_only", "missing"]);
    expect(g.rows[1]!.cells).toEqual(["not_expected", "not_expected", "both", "missing"]);
    expect(g.rows[0]!.gaps.map((x) => x.date)).toEqual(["2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(g.rows[1]!.counts).toMatchObject({ not_expected: 2, both: 1, missing: 1 });
  });

  it("collapses missing dates into runs", () => {
    expect(dateRuns(["2026-09-03", "2026-09-01", "2026-09-02", "2026-10-07"])).toEqual(["1 Sept 2026 – 3 Sept 2026", "7 Oct 2026"]);
  });

  it("reads the window from the URL, defaulting to 13 weeks", () => {
    expect([parseWindow(undefined), parseWindow("26"), parseWindow(["52"]), parseWindow("9"), parseWindow("x")]).toEqual([13, 26, 52, 13, 13]);
    expect(windowStart("2026-10-31", 13)).toBe("2026-08-02");               // 91 days, inclusive
  });
});

describe("check anchors", () => {
  it("every check heading in data_quality.md gets the anchor slugify predicts", async () => {
    const source = readFileSync(path.resolve(__dirname, "../../docs/data_quality.md"), "utf8");
    const headings = [...source.matchAll(/^### (`[a-z_.0-9]+`.*)$/gm)].map((m) => m[1]!);
    expect(headings.length).toBeGreaterThan(20);
    const doc = await renderMarkdown(source, "data_quality.md");
    render(<>{doc.content}</>);
    for (const heading of headings) {
      const id = slugify(heading.replace(/`/g, ""));
      expect(document.getElementById(id), `${heading} -> #${id}`).not.toBeNull();
    }
  });
});
