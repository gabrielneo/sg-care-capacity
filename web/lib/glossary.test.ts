import { describe, expect, it } from "vitest";

import { firstUseText, segmentText, term } from "./glossary";

describe("glossary helpers", () => {
  it("spells out first use, with plurals", () => {
    expect(firstUseText(term("chas"))).toBe("Community Health Assist Scheme (CHAS)");
    expect(firstUseText(term("ed"), true)).toBe("Emergency Departments (EDs)");
    expect(firstUseText(term("singhealth"))).toBe("SingHealth");
    expect(firstUseText(term("median"))).toBe("Median");
  });

  it("finds whole-word terms only, longest first", () => {
    const segs = segmentText("MOH counts ED visits at EDs; CHASE and BED are not terms. NHG Health runs TTSH.");
    const ids = segs.filter((s) => typeof s !== "string").map((s) => (s as { id: string }).id);
    expect(ids).toEqual(["moh", "ed", "ed", "nhg_health", "ttsh"]);
    expect(segs.map((s) => (typeof s === "string" ? s : `[${s.text}]`)).join("")).toBe(
      "[MOH] counts [ED] visits at [EDs]; CHASE and BED are not terms. [NHG Health] runs [TTSH].");
  });

  it("matches explained words and aliases, never technical terms", () => {
    const ids = segmentText("the daily median, two medians, bed waits, right-siting, attendances, choropleth")
      .flatMap((s) => (typeof s === "string" ? [] : [s.id]));
    expect(ids).toEqual(["median", "median", "bed_wait", "right_siting"]);
  });
});
