import { describe, expect, it } from "vitest";

import { clinicMeta, edMeta } from "@/test/fixtures/meta";
import { render, validate } from "@/scripts/gen-datasets.mjs";

import { DATASETS } from "./datasets.generated";
import {
  CADENCE_TEXT, datasetFreshness, freshnessText, humanAge, LABELS, metaFreshness, ruleText, sourcesFreshness, worstFreshness,
} from "./freshness";

// Every date is injected: no test reads the real clock.
const at = (iso: string) => new Date(iso);

describe("one freshness function, per dataset (docs/datasets.yml)", () => {
  it.each([
    // MOH weekly bed waits: due an update after 10 days, overdue after 21
    ["moh_bed_waits", "2026-10-31", "2026-11-06T12:00:00+08:00", "up_to_date"],
    ["moh_bed_waits", "2026-10-31", "2026-11-10T00:00:00+08:00", "up_to_date"],
    ["moh_bed_waits", "2026-10-31", "2026-11-10T00:00:01+08:00", "due"],
    ["moh_bed_waits", "2026-10-31", "2026-11-21T00:00:01+08:00", "overdue"],
    // NUHS doctor-wait estimates: a reading at one moment
    ["nuhs_live", "2026-11-06T12:01:49", "2026-11-06T20:00:00+08:00", "up_to_date"],
    ["nuhs_live", "2026-11-06T12:01:49", "2026-11-09T12:00:00+08:00", "due"],
    ["nuhs_live", "2026-11-06T12:01:49", "2026-11-14T12:00:00+08:00", "overdue"],
    // CHAS clinics: the real list (June 2024) is old in November 2026, and says so
    ["datagov_chas", "2024-06-06T14:36:42", "2026-11-06T12:00:00+08:00", "overdue"],
    ["datagov_chas", "2026-01-04T10:06:46", "2026-11-06T12:00:00+08:00", "up_to_date"],
    // URA boundaries (data.gov.sg)
    ["datagov_planning_areas", "2025-03-01", "2026-11-06T12:00:00+08:00", "due"],
    // SingStat population (end-June): due after 15 months, overdue after 18
    ["singstat_residents", "2026-06-30", "2027-09-30T00:00:00+08:00", "up_to_date"],
    ["singstat_residents", "2026-06-30", "2027-10-01T00:00:00+08:00", "due"],
    ["singstat_residents", "2026-06-30", "2028-01-01T00:00:00+08:00", "overdue"],
  ] as const)("%s as of %s, checked %s, is %s", (id, asOf, now, level) => {
    expect(datasetFreshness(id, asOf, at(now)).level).toBe(level);
  });

  it("covers every dataset the brief names, and the findings inherit instead of having limits", () => {
    for (const id of ["moh_bed_waits", "nuhs_live", "datagov_chas", "datagov_planning_areas", "singstat_residents", "insight_findings"]) {
      expect(DATASETS[id], id).toBeDefined();
    }
    expect(DATASETS["insight_findings"]!.inherits).toBe(true);
    expect(DATASETS["moh_bed_waits"]!.cadence).toBe("weekly");
  });

  it("is unknown, never up to date, when the date can't be read", () => {
    expect(datasetFreshness("moh_bed_waits", "", at("2026-11-06"))).toMatchObject({ level: "unknown", label: "Date unknown", age: null });
  });

  it("labels: Up to date, Due an update, Overdue (never \"Ageing\", read as a topic tag on a site about ageing)", () => {
    expect([LABELS.up_to_date, LABELS.due, LABELS.overdue]).toEqual(["Up to date", "Due an update", "Overdue"]);
    expect(Object.values(LABELS)).not.toContain("Ageing");
    expect(CADENCE_TEXT.weekly).toBe("weekly");
  });

  it("shows the label, the cadence and the as-of date, in words", () => {
    const f = datasetFreshness("moh_bed_waits", "2026-10-31", at("2026-11-14T12:00:00+08:00"));
    expect(freshnessText(f)).toBe("Due an update · weekly · as of 31 Oct 2026");
    expect(f.age).toBe("2 weeks");
    const nuhs = datasetFreshness("nuhs_live", "2026-11-08T22:00:44", at("2026-11-09T12:00:00+08:00"));
    expect(freshnessText(nuhs)).toBe("Up to date · a reading at one moment · as of 8 Nov 2026, 10:00 pm SGT");
    expect(ruleText("moh_bed_waits")).toBe("weekly: due an update after 10 days, overdue after 21 days");
    expect(ruleText("insight_findings")).toMatch(/least fresh/);
  });

  it("counts the age from the dataset's own as-of date, not the release date", () => {
    // The release is from 9 Nov; MOH's figures run to 31 Oct. 14 Nov is 14 days after the data: due an update.
    const meta = { ...edMeta, as_of: "2026-11-09T02:40:56" };
    expect(metaFreshness(meta, at("2026-11-14T12:00:00+08:00"))).toMatchObject({ level: "due", asOf: "2026-10-31" });
  });

  it("describes the age in words", () => {
    expect(humanAge(6 * 86_400_000)).toBe("6 days");
    expect(humanAge(1 * 86_400_000)).toBe("1 day");
    expect(humanAge(20 * 86_400_000)).toBe("2 weeks");
    expect(humanAge(4 * 30.5 * 86_400_000)).toBe("4 months");
  });
});

describe("a combined figure inherits the least fresh of its datasets", () => {
  const now = at("2026-11-14T12:00:00+08:00");
  const moh = { id: "moh_bed_waits", as_of: "2026-10-31" };      // due an update on 14 Nov
  const nuhs = { id: "nuhs_live", as_of: "2026-11-14T08:00:00" }; // up to date

  it("a finding from MOH's data can't be up to date while MOH is due an update", () => {
    expect(sourcesFreshness([nuhs, moh], now)).toMatchObject({ level: "due", sourceId: "moh_bed_waits" });
    expect(sourcesFreshness([nuhs], now)!.level).toBe("up_to_date");
    expect(metaFreshness(clinicMeta, now)!.level).toBe("overdue");
  });

  it("worst wins; nothing to judge gives nothing", () => {
    const f = (level: "up_to_date" | "due" | "overdue") => ({ ...datasetFreshness("moh_bed_waits", "2026-10-31", now), level });
    expect(worstFreshness([f("up_to_date"), f("overdue"), f("due")])!.level).toBe("overdue");
    expect(worstFreshness([])).toBeNull();
    expect(sourcesFreshness([{ id: "moh_bed_waits", as_of: null }], now)).toBeNull();
  });
});

describe("docs/datasets.yml", () => {
  it("is valid, and the committed module matches it (npm run gen:datasets)", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const { parse } = await import("yaml");
    const { datasets } = parse(readFileSync(path.resolve(import.meta.dirname, "../../docs/datasets.yml"), "utf8"));
    expect(validate(datasets)).toEqual([]);
    expect(readFileSync(path.resolve(import.meta.dirname, "datasets.generated.ts"), "utf8")).toBe(render(datasets));
  });

  it("rejects a dataset with no limits, a bad cadence or limits in the wrong order", () => {
    expect(validate({ x: { label: "X", publisher: "P", cadence: "weekly" } })).toHaveLength(1);
    expect(validate({ x: { label: "X", publisher: "P", cadence: "daily", due_after: { days: 1 }, overdue_after: { days: 2 } } })).toHaveLength(1);
    expect(validate({ x: { label: "X", publisher: "P", cadence: "weekly", due_after: { days: 9 }, overdue_after: { days: 3 } } })).toHaveLength(1);
  });
});
