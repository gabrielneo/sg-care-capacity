import { describe, expect, it } from "vitest";

import { clinicMeta, edMeta } from "@/test/fixtures/meta";

import { cadenceFor, freshness, humanAge } from "./freshness";

const at = (iso: string) => new Date(iso);

describe("freshness by cadence", () => {
  it.each([
    // weekly: green within 10 days, amber within 21
    ["2026-10-31", "weekly", "2026-11-06T12:00:00+08:00", "green"],
    ["2026-10-31", "weekly", "2026-11-10T00:00:00+08:00", "green"],
    ["2026-10-31", "weekly", "2026-11-10T00:00:01+08:00", "amber"],
    ["2026-10-31", "weekly", "2026-11-21T00:00:01+08:00", "red"],
    // annual (SingStat end-June): green within 15 months, amber within 18
    ["2026-06-30", "annual", "2027-09-30T00:00:00+08:00", "green"],
    ["2026-06-30", "annual", "2027-10-01T00:00:00+08:00", "amber"],
    ["2026-06-30", "annual", "2028-01-01T00:00:00+08:00", "red"],
    // irregular: the real CHAS list (June 2024) is old in November 2026, and says so
    ["2024-06-06T14:36:42", "irregular", "2026-11-06T12:00:00+08:00", "red"],
    ["2026-01-04T10:06:46", "irregular", "2026-11-06T12:00:00+08:00", "green"],
    // live readings: a week-old reading is amber
    ["2026-11-06T12:01:49", "live", "2026-11-06T20:00:00+08:00", "green"],
    ["2026-11-06T12:01:49", "live", "2026-11-09T12:00:00+08:00", "amber"],
    ["2026-11-06T12:01:49", "live", "2026-11-14T12:00:00+08:00", "red"],
  ] as const)("%s (%s) checked %s is %s", (asOf, cadence, now, level) => {
    expect(freshness(asOf, cadence, at(now)).level).toBe(level);
  });

  it("is unknown, not green, when the date can't be read", () => {
    expect(freshness("", "weekly")).toMatchObject({ level: "unknown", label: "Date unknown", age: null });
  });

  it("describes the age in words", () => {
    expect(freshness("2024-06-06T14:36:42", "irregular", at("2026-11-06T12:00:00+08:00"))).toMatchObject({
      label: "Old",
      age: "2 years",
    });
    expect(humanAge(6 * 86_400_000)).toBe("6 days");
    expect(humanAge(1 * 86_400_000)).toBe("1 day");
    expect(humanAge(20 * 86_400_000)).toBe("2 weeks");
    expect(humanAge(4 * 30.5 * 86_400_000)).toBe("4 months");
  });
});

describe("cadenceFor", () => {
  it("uses the source that meta.as_of comes from", () => {
    expect(cadenceFor(edMeta)).toBe("weekly");
    expect(cadenceFor(clinicMeta)).toBe("irregular");
    const areas = { as_of: "2024-06-06T14:36:42", sources: [
      { ...edMeta.sources[0]!, id: "singstat_residents", as_of: "2026-06-30" },
      { ...clinicMeta.sources[0]! },
    ] };
    expect(cadenceFor(areas)).toBe("irregular");                          // the older input sets the pace
  });
});
