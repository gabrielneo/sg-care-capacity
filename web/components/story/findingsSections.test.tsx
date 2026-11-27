import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Hospital, InsightTest } from "@/lib/api/types";
import { insightMeta, storySample } from "@/lib/samples";

import { AllFindings, groupFindings } from "./AllFindings";
import { NextSteps } from "./Sections";
import { TestLedger } from "./TestLedger";

const hospital = (code: string, name: string): Hospital => ({
  hospital_code: code, hospital_name: name, cluster: "x", facility_type: "ED", reported_from: null, coverage_note: null,
  exclusions_note: null, source_url: "https://www.moh.gov.sg/", as_of: "2026-11-06", as_of_basis: "reference_checked" });
const meta = { ...insightMeta, sources: insightMeta.sources };

describe("AllFindings", () => {
  it("groups every finding by the question it answers, each closed until opened, with its chart inside", () => {
    render(<AllFindings insights={storySample} meta={meta} hasTests />);
    const groups = screen.getAllByTestId("finding-group");
    expect(groups.map((g) => g.getAttribute("data-type"))).toEqual(["weekday", "volume_vs_wait", "anomaly"]);
    const rows = screen.getAllByTestId("finding-row");
    expect(rows).toHaveLength(storySample.length);
    for (const r of rows) {
      expect(r.querySelector("details")).not.toHaveAttribute("open");
      expect(within(r).getByTestId("evidence-chip")).toBeInTheDocument();
      expect(r.querySelector("h4")).not.toBeNull();                  // the chart's heading sits under the group's h3
    }
    expect(screen.getByRole("link", { name: /Every test run/ })).toHaveAttribute("href", "#tests");
  });

  it("links to the tests only when they are on the page, and keeps the engine's order within a group", () => {
    render(<AllFindings insights={storySample} meta={meta} />);
    expect(screen.queryByRole("link", { name: /Every test run/ })).toBeNull();
    expect(groupFindings(storySample).flatMap((g) => g.items).map((i) => i.type)).toEqual(["weekday", "volume_vs_wait", "anomaly"]);
  });
});

describe("TestLedger", () => {
  const test = (o: Partial<InsightTest>): InsightTest => ({
    type: "volume_vs_wait", entity: "SGH", variant: "positive", n: 181, n_unit: "days", when: "the day after", effect_size: 0.3,
    metric_value: 0.3, unit: "Spearman correlation", ci_low: 0.15, ci_high: 0.45, ci_null: 0, p_value: 0.005, p_adjusted: 0.02,
    outcome: "published", ...o });
  const tests = [test({}), test({ entity: "CGH", outcome: "not significant after correction (adjusted p 0.2)", metric_value: 0.1,
                                  ci_low: -0.05, ci_high: 0.25 })];

  it("shows every test with its outcome in words, filled for passed and hollow for not, and a table", () => {
    render(<TestLedger tests={tests} meta={meta} hospitals={[hospital("SGH", "Singapore General Hospital"), hospital("CGH", "Changi General Hospital")]} />);
    expect(screen.getByTestId("ledger-tally")).toHaveTextContent("2 statistical tests this week: 1 passed and 1 did not.");
    const rows = screen.getAllByTestId("ledger-row");
    expect(rows.map((r) => r.getAttribute("data-outcome"))).toEqual(["not_significant", "published"]);   // by hospital code: CGH, SGH
    expect(rows[0]).toHaveTextContent("Changi General, the day after");
    expect(rows[0]).toHaveTextContent("0.10 · Not significant after correction");
    expect(screen.getAllByRole("link").some((a) => a.getAttribute("href")?.startsWith("/export/tests.csv"))).toBe(true);
    expect(screen.getByRole("table")).toHaveTextContent("−0.05 to 0.25");
  });

  it("counts only the warnings on the tables of the tests it draws", () => {
    const warnings = [{ check_id: "a", table: "moh_bed_waits", severity: "WARN", failing_rows: 1, details: "x" },
                      { check_id: "b", table: "chas_clinics", severity: "ERROR", failing_rows: 1, details: "y" }] as typeof meta.dq_warnings;
    render(<TestLedger tests={[test({ source_ids: ["moh_bed_waits"], dq_tables: ["moh_bed_waits"] }),
                               test({ type: "access_gap", entity: "BEDOK", source_ids: ["datagov_chas"], dq_tables: ["chas_clinics"] })]}
                       meta={{ ...meta, dq_warnings: warnings }} hospitals={[]} />);
    expect(screen.getByTestId("test-ledger")).toHaveTextContent(/1 data-quality warning applies/);
  });

  it("names the urgent care centre as one", () => {
    render(<TestLedger tests={[test({ entity: "AH" })]} meta={meta} hospitals={[{ ...hospital("AH", "Alexandra Hospital"), facility_type: "UCC" }]} />);
    expect(screen.getByTestId("ledger-row")).toHaveTextContent("Alexandra (urgent care centre), the day after");
  });

  it("draws nothing when there is nothing to draw", () => {
    const { container } = render(<TestLedger tests={[]} meta={meta} hospitals={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("NextSteps", () => {
  it("lists the steps in order, under one heading", () => {
    render(<NextSteps items={["First", "Second"]} />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("What's next");
    expect(screen.getAllByTestId("next-step").map((li) => li.textContent)).toEqual(["1First", "2Second"]);
  });
});
