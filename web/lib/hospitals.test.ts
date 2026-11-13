/**
 * ADR 0012: the urgent care centre is left out of every rank, count, median and "largest change" across
 * hospitals. Each aggregate on the site is fed a UCC that would lead it, and must leave it out.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { EdWeek, Hospital, Insight, Meta } from "./api/types";
import { selectCallouts } from "./callouts";
import { sortRows, type CareRow } from "./careMapState";
import { findingFor } from "./edCompare";
import {
  isUrgentCareFinding, rankableCodes, rankableHospitals, splitByCare, systemFindings, urgentCareFindings, urgentCareHospitals,
} from "./hospitals";
import { aboveUsual, acrossHospitals, largestChange, longestWait } from "./planner";
import type { HospitalStatus } from "./status";
import { storySteps } from "./story";
import { buildStrip } from "./strip";
import { takeaways } from "./takeaways";

const h = (hospital_code: string, facility_type: "ED" | "UCC" = "ED") => ({ hospital_code, facility_type, cluster: "X" }) as Hospital;
const HOSPITALS = [h("SGH"), h("CGH"), h("TTSH"), h("AH", "UCC")];

// AH leads every measure: the most hours, the biggest change, far above usual.
const st = (code: string, pct: number, latest: number): HospitalStatus =>
  ({ code, pct, latest, usual: latest / (1 + pct / 100), level: pct >= 30 ? "much_higher" : pct >= 15 ? "higher" : "usual",
     spark: Array.from({ length: 12 }, () => latest) });
const STATUSES = [st("SGH", 20, 5), st("CGH", 16, 4), st("TTSH", 0, 6), st("AH", 300, 99)];

const finding = (entity: string, rank: number | null, scope?: Insight["scope"]) =>
  ({ insight_id: `weekday-${entity}`, type: "weekday", entity, headline_rank: rank, rank_score: rank ? 1 - rank / 10 : 0.99,
     effect_size: 1, scope, headline: "h", strength: "strong",
     display: { value_text: "1", unit_text: "hours", metric_label: "m", comparison_label: null, change: null, change_word: null },
     chart: { kind: "bar", callout: "c", highlight: ["mon"], points: [], reference: null, trend_line: null, x_label: null, y_label: "y" },
  }) as unknown as Insight;
// AH is ranked first, as the 9 Nov 2026 release did; an older release has no scope.
const FINDINGS = [finding("AH", 1), finding("SGH", 2), finding("CGH", 3)];

describe("the helpers", () => {
  it("split hospitals and items by facility type, keeping the order given", () => {
    expect(rankableHospitals(HOSPITALS).map((x) => x.hospital_code)).toEqual(["SGH", "CGH", "TTSH"]);
    expect(urgentCareHospitals(HOSPITALS).map((x) => x.hospital_code)).toEqual(["AH"]);
    expect(rankableCodes(HOSPITALS)).toEqual(["SGH", "CGH", "TTSH"]);
    const { rankable, urgentCare } = splitByCare(STATUSES, (s) => s.code, HOSPITALS);
    expect([rankable.map((s) => s.code), urgentCare.map((s) => s.code)]).toEqual([["SGH", "CGH", "TTSH"], ["AH"]]);
  });

  it("treat a code missing from the reference as comparable (it can't be called a UCC without it)", () => {
    expect(splitByCare([{ code: "NEW" }], (x) => x.code, HOSPITALS).rankable).toHaveLength(1);
  });

  it("tell an urgent-care finding by its scope first, else by the hospital reference", () => {
    expect(isUrgentCareFinding(finding("AH", 1), HOSPITALS)).toBe(true);
    expect(isUrgentCareFinding(finding("AH", 1, "system"), HOSPITALS)).toBe(false);          // the engine's scope wins
    expect(isUrgentCareFinding(finding("SGH", 1, "urgent_care"), HOSPITALS)).toBe(true);
    expect(systemFindings(FINDINGS, HOSPITALS).map((i) => i.entity)).toEqual(["SGH", "CGH"]);
    expect(urgentCareFindings(FINDINGS, HOSPITALS).map((i) => i.entity)).toEqual(["AH"]);
  });
});

describe("every aggregate across hospitals leaves the urgent care centre out", () => {
  it("counts: hospitals above usual", () => {
    expect(aboveUsual(STATUSES, HOSPITALS).map((s) => s.code)).toEqual(["SGH", "CGH"]);
  });

  it("ranks: longest bed wait, largest change", () => {
    expect(longestWait(STATUSES, HOSPITALS)?.code).toBe("TTSH");
    expect(largestChange(STATUSES, HOSPITALS)?.code).toBe("SGH");
  });

  it("medians: the middle across hospitals", () => {
    expect(acrossHospitals(STATUSES, HOSPITALS).at(-1)).toBe(5);        // 4, 5, 6 (not 99)
  });

  it("the site strip's count", () => {
    const starts = Array.from({ length: 10 }, (_, k) => new Date(Date.UTC(2026, 7, 17 + 7 * k)).toISOString().slice(0, 10));
    const weekly = ["SGH", "CGH", "TTSH", "AH"].flatMap((code) => starts.map((week_start, k) =>
      ({ hospital_code: code, week_start, is_complete_week: true, mean_of_daily_median_wait_hours: code === "AH" && k === 9 ? 9 : 2 }) as EdWeek));
    const meta = { as_of: "2026-10-31", sources: [{ id: "moh_bed_waits", name: "MOH", as_of: "2026-10-31" }] } as unknown as Meta;
    expect(buildStrip({ hospitals: HOSPITALS, weekly, weeklyMeta: meta, live: [], liveMeta: null, now: new Date("2026-11-03") }))
      .toMatchObject({ total: 3, above: 0 });
  });

  it("orders: the hospital list puts the UCC in its own group, last", () => {
    const row = (code: string, latest: number): CareRow => ({ code, name: code, cluster: "X", latitude: null, longitude: null, note: null,
      level: "usual", latest, usual: latest, pct: 0, urgentCare: code === "AH" });
    expect(sortRows([row("AH", 99), row("SGH", 5), row("TTSH", 6)], "hours").map((r) => r.code)).toEqual(["TTSH", "SGH", "AH"]);
  });

  it("takeaways and headline findings: never about the UCC, even when it ranks first", () => {
    expect(takeaways(FINDINGS, HOSPITALS).map((t) => t.entity)).toEqual(["SGH", "CGH"]);
    expect(storySteps(FINDINGS, HOSPITALS).map((i) => i.entity)).toEqual(["SGH", "CGH"]);
  });

  it("chart annotations and callouts: the strongest system-wide finding", () => {
    expect(findingFor(FINDINGS, "weekday", HOSPITALS)?.entity).toBe("SGH");
    expect(selectCallouts(FINDINGS, ["weekday"], ["AH", "SGH", "CGH"], HOSPITALS).shown.map((i) => i.entity)).toEqual(["SGH", "CGH"]);
  });
});

describe("one source of truth", () => {
  const ROOT = path.resolve(import.meta.dirname, "..");
  const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) && !/\.test\.|\.generated\.|schema\.d\.ts|samples\.ts/.test(f) ? [p] : [];
  });

  it("no production file tests the code \"AH\" or the facility type itself, except lib/hospitals.ts", () => {
    const offenders = ["app", "components", "lib"].flatMap((d) => files(path.join(ROOT, d)))
      .filter((f) => !f.endsWith(path.join("lib", "hospitals.ts")))
      .filter((f) => /["']AH["']|facility_type\s*[!=]==/.test(readFileSync(f, "utf8").replace(/^\s*(\*|\/\/).*$/gm, "")));
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
  });
});
