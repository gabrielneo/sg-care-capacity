import { describe, expect, it } from "vitest";

import type { Meta, Source } from "./api/types";
import { findingMeta, oldestAsOf, sourceDates } from "./provenance";

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
    expect(sourceDates([NUHS, MOH_WAIT, MOH_ATT])).toEqual([
      { name: "NUHS", asOf: "2026-11-08T22:00:44", cadence: "live" },
      { name: "MOH", asOf: "2026-10-31", cadence: "weekly" }]);
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

  it("keeps every source for a release from before source_ids", () => {
    expect(findingMeta({ as_of: "2026-10-25" }, meta).sources).toHaveLength(5);
  });
});
