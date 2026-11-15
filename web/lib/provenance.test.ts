import { describe, expect, it } from "vitest";

import type { Meta, Source } from "./api/types";
import { findingMeta, oldestAsOf, provenanceLineKey, sharedFindingMeta, sourceDates } from "./provenance";

const src = (id: string, name: string, as_of: string | null): Source =>
  ({ id, name, url: null, as_of, as_of_basis: null, last_fetched_at: null }) as Source;
const MOH_WAIT = src("moh_bed_waits", "MOH, Waiting Time for Admission to Ward", "2026-10-31");
const MOH_ATT = src("moh_ed_attendances", "MOH, Attendances", "2026-10-31");
const NUHS = src("nuhs_live", "NUHS, ED waiting times", "2026-11-08T22:00:44");
const CHAS = src("datagov_chas", "data.gov.sg, CHAS Clinics", "2024-06-06T14:36:42");
const POP = src("singstat_residents", "SingStat, Residents", "2026-06-30");
const meta = { snapshot_id: "data-2026-11-08", as_of: "2026-10-25", sources: [CHAS, MOH_WAIT, MOH_ATT, NUHS, POP],
               caveats: [], dq_warnings: [], coverage: null } as Meta;

describe("source dates", () => {
  it("gives each publisher its own date (the NUHS-vs-MOH chart: audit H-1)", () => {
    expect(sourceDates([NUHS, MOH_WAIT, MOH_ATT])).toMatchObject([
      { name: "NUHS", asOf: "2026-11-08T22:00:44", cadence: "moment", sources: [NUHS] },
      { name: "MOH", asOf: "2026-10-31", cadence: "weekly", sources: [MOH_WAIT, MOH_ATT] }]);
  });

  it("compares dates as times, and skips sources without one", () => {
    expect(oldestAsOf([NUHS, CHAS, MOH_WAIT])).toBe("2024-06-06T14:36:42");
    expect(oldestAsOf([src("x", "X", null)])).toBeNull();
    expect(sourceDates([src("x", "X", null)])).toEqual([]);
  });
});

describe("findingMeta", () => {
  it("dates an ED finding by MOH's data, not the end of its window (audit M-1)", () => {
    const m = findingMeta({ source_ids: ["moh_bed_waits"], as_of: "2026-10-25" }, meta);
    expect(m.as_of).toBe("2026-10-31");
    expect(m.sources.map((s) => s.id)).toEqual(["moh_bed_waits"]);
  });

  it("dates an access finding by the clinic list and SingStat, not MOH (audit M-2)", () => {
    const m = findingMeta({ source_ids: ["datagov_chas", "singstat_residents"], as_of: "2024-06-06" }, meta);
    expect(m.as_of).toBe("2024-06-06T14:36:42");
    expect(m.sources.map((s) => s.id)).toEqual(["datagov_chas", "singstat_residents"]);
  });

  it("keeps only the warnings on the finding's own tables (audit L-7)", () => {
    const w = (table: string) => ({ check_id: `x.${table}`, table, severity: "WARN", scope: "row", failing_rows: 1, details: null });
    const withWarnings = { ...meta, dq_warnings: [w("moh_bed_waits"), w("chas_clinics")] } as Meta;
    const m = findingMeta({ source_ids: ["moh_bed_waits"], dq_tables: ["moh_bed_waits"], as_of: "2026-10-25" }, withWarnings);
    expect(m.dq_warnings.map((x) => x.table)).toEqual(["moh_bed_waits"]);
  });

  it("keeps every source for a release from before source_ids", () => {
    expect(findingMeta({ as_of: "2026-10-25" }, meta).sources).toHaveLength(5);
  });
});

describe("sharedFindingMeta (one line for the Findings section, review N1)", () => {
  const w = (table: string) => ({ check_id: `x.${table}`, table, severity: "WARN", scope: "row", failing_rows: 1, details: null });

  it("is the findings' date and sources when every finding shares them, with no warnings of its own", () => {
    const withWarnings = { ...meta, dq_warnings: [w("moh_bed_waits")] } as Meta;
    const m = sharedFindingMeta([
      { source_ids: ["moh_bed_waits"], dq_tables: ["moh_bed_waits"], as_of: "2026-10-25" },
      { source_ids: ["moh_bed_waits"], as_of: "2026-10-18" },
    ], withWarnings);
    expect(m?.as_of).toBe("2026-10-31");
    expect(m?.sources.map((s) => s.id)).toEqual(["moh_bed_waits"]);
  });

  it("covers findings that cite different datasets of one publisher with the same date, and lists them all", () => {
    const m = sharedFindingMeta([
      { source_ids: ["moh_bed_waits"], as_of: "2026-10-25" },
      { source_ids: ["moh_bed_waits", "moh_ed_attendances"], as_of: "2026-10-25" },
    ], meta);
    expect(m?.sources.map((s) => s.id)).toEqual(["moh_bed_waits", "moh_ed_attendances"]);
    expect(m?.dq_warnings).toEqual([]);                // each finding's warnings stay with its chart
  });

  it("is null when the findings' sources or dates differ, so each chart keeps its own line", () => {
    expect(sharedFindingMeta([
      { source_ids: ["moh_bed_waits"], as_of: "2026-10-25" },
      { source_ids: ["datagov_chas", "singstat_residents"], as_of: "2024-06-06" },
    ], meta)).toBeNull();
    expect(sharedFindingMeta([], meta)).toBeNull();
    const NUHS_ONLY = { ...meta, sources: [NUHS] };
    expect(provenanceLineKey(NUHS_ONLY)).not.toBe(provenanceLineKey({ ...meta, sources: [MOH_WAIT] }));
  });
});

describe("source lines are generated from the API's meta, never hand-written (A3)", () => {
  it("only Provenance and AsOfLine write \"Source:\", and no code types a publisher after it", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const path = await import("node:path");
    const ROOT = path.resolve(import.meta.dirname, "..");
    const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
      const p = path.join(dir, f);
      return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) && !/\.test\.|samples\.ts|schema\.d\.ts/.test(f) ? [p] : [];
    });
    const writers: string[] = [];
    for (const f of ["app", "components", "lib"].flatMap((d) => files(path.join(ROOT, d)))) {
      const code = readFileSync(f, "utf8").replace(/^\s*(\*|\/\/).*$/gm, "");
      if (/Source: /.test(code)) writers.push(path.relative(ROOT, f));
      expect(code, path.relative(ROOT, f)).not.toMatch(/Sources?: (MOH|NUHS|SingStat|data\.gov\.sg|Ministry of Health)/);
    }
    expect(writers.sort()).toEqual(["components/Provenance.tsx", "components/story/Sections.tsx"]);   // provenanceText (the caption) is in Provenance.tsx too
  });
});
