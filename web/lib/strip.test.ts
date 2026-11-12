import { describe, expect, it } from "vitest";

import type { EdWeek, Hospital, LiveReading, Meta } from "./api/types";
import { buildStrip } from "./strip";

const NOW = new Date("2026-11-12T10:00:00+08:00"); // injected: no test reads the real clock

const hosp = (code: string, cluster: string) => ({ hospital_code: code, cluster }) as Hospital;
const hospitals = [hosp("SGH", "SingHealth"), hosp("CGH", "SingHealth"), hosp("NUH", "NUHS")];

const src = (id: string, name: string, as_of: string) => ({ id, name, as_of, as_of_basis: null, last_fetched_at: null, url: null });
const meta = (sources: Meta["sources"]) => ({ as_of: sources[0]!.as_of, sources }) as unknown as Meta;
const mohMeta = meta([src("moh_bed_waits", "MOH, bed waits", "2026-10-31")]);
const nuhsMeta = meta([src("nuhs_live", "NUHS, live", "2026-11-11T12:01:49")]);

const starts = ["2026-08-17", "2026-08-24", "2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19"];
const week = (code: string, week_start: string, h: number) =>
  ({ hospital_code: code, week_start, is_complete_week: true, mean_of_daily_median_wait_hours: h }) as EdWeek;
const series = (code: string, usual: number, last: number) => [...starts.slice(0, -1).map((s) => week(code, s, usual)), week(code, starts.at(-1)!, last)];

describe("buildStrip", () => {
  const weekly = [...series("SGH", 10, 14), ...series("CGH", 10, 10), ...series("NUH", 10, 11)];

  it("counts hospitals above usual with the existing 15% rule, and says the week and clusters from the data", () => {
    const s = buildStrip({ hospitals, weekly, weeklyMeta: mohMeta, live: [], liveMeta: null, now: NOW })!;
    expect(s).toMatchObject({ total: 3, above: 1, noComparison: 0, week: "19–25 Oct 2026" });
    expect(s.clusters).toEqual([{ name: "NUHS", count: 1 }, { name: "SingHealth", count: 2 }]);
  });

  it("gives the bed-wait pill its own date and age, with no doctor pill when NUHS has no reading", () => {
    const s = buildStrip({ hospitals, weekly, weeklyMeta: mohMeta, live: [], liveMeta: nuhsMeta, now: NOW })!;
    expect(s.pills).toEqual([{ id: "bed", dataset: "Bed waits", source: "MOH", level: "amber", label: "Due an update",
      detail: "weekly · 12 days old", asOf: "2026-10-31" }]);
  });

  it("labels the estimates with their own time, not the bed-wait date", () => {
    const s = buildStrip({ hospitals, weekly, weeklyMeta: mohMeta, live: [{} as LiveReading], liveMeta: nuhsMeta, now: NOW })!;
    const doctor = s.pills.find((p) => p.id === "doctor")!;
    expect(doctor).toMatchObject({ dataset: "Doctor-wait estimates", source: "NUHS", level: "green", asOf: "2026-11-11T12:01:49" });
    expect(doctor.detail).toBe("updated 11 Nov 2026, 12:01 pm SGT");
    expect(doctor.detail).not.toContain("31 Oct");
  });

  it("turns amber to green to red as the injected date moves", () => {
    const at = (iso: string) => buildStrip({ hospitals, weekly, weeklyMeta: mohMeta, live: [], liveMeta: null, now: new Date(iso) })!.pills[0]!.level;
    expect(at("2026-11-10T00:00:00+08:00")).toBe("green");
    expect(at("2026-11-12T00:00:00+08:00")).toBe("amber");
    expect(at("2026-11-22T00:00:00+08:00")).toBe("red");
  });

  it("keeps hospitals with no comparison separate from 'not above usual'", () => {
    const s = buildStrip({ hospitals, weekly: series("SGH", 10, 14), weeklyMeta: mohMeta, live: [], liveMeta: null, now: NOW })!;
    expect(s).toMatchObject({ above: 1, noComparison: 2 });
  });

  it("is null without hospitals or weekly meta, so the strip says nothing rather than guessing", () => {
    expect(buildStrip({ hospitals: [], weekly, weeklyMeta: mohMeta, live: [], liveMeta: null, now: NOW })).toBeNull();
    expect(buildStrip({ hospitals, weekly, weeklyMeta: null, live: [], liveMeta: null, now: NOW })).toBeNull();
  });
});
