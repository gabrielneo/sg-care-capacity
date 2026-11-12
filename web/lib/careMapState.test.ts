import { describe, expect, it } from "vitest";

import { type CareRow, clusterList, filterByCluster, matchCluster, parseCareParams, pinned, sortRows, withCareParams } from "./careMapState";

const row = (code: string, cluster: string, over: Partial<CareRow> = {}): CareRow => ({
  code, name: `${code} Hospital`, cluster, latitude: 1.3, longitude: 103.8, note: null, level: "usual", latest: 4, usual: 4, pct: 0, ...over });
const rows = [row("SGH", "SingHealth", { latest: 5, pct: 25, level: "higher" }), row("TTSH", "NHG Health", { latest: 6, pct: 40, level: "much_higher" }),
  row("AH", "NUHS", { latest: 2, pct: null, usual: null, level: "unknown" }), row("NUH", "NUHS", { latest: null, pct: -20, level: "lower" })];

describe("clusters come from the data", () => {
  it("lists each distinct cluster once, A to Z", () => {
    expect(clusterList(rows)).toEqual(["NHG Health", "NUHS", "SingHealth"]);
  });
  it("matches a requested cluster in any case, and ignores one the data doesn't have", () => {
    expect(matchCluster("nuhs", rows)).toBe("NUHS");
    expect(matchCluster("NHG+Health".replace("+", " "), rows)).toBe("NHG Health");
    expect(matchCluster("NHG", rows)).toBeNull();
    expect(matchCluster("", rows)).toBeNull();
    expect(matchCluster(null, rows)).toBeNull();
  });
  it("filters by cluster; no cluster is every hospital", () => {
    expect(filterByCluster(rows, "NUHS").map((r) => r.code)).toEqual(["AH", "NUH"]);
    expect(filterByCluster(rows, null)).toHaveLength(4);
  });
});

describe("parseCareParams", () => {
  it("reads every parameter", () => {
    expect(parseCareParams("cluster=NUHS&layout=list&hospital=ah&sort=hours&view=planner", rows))
      .toEqual({ cluster: "NUHS", layout: "list", hospital: "AH", sort: "hours" });
  });
  it("falls back to the defaults for anything it doesn't know", () => {
    expect(parseCareParams("cluster=XYZ&layout=grid&hospital=NOPE&sort=zzz", rows))
      .toEqual({ cluster: null, layout: null, hospital: null, sort: "usual" });
    expect(parseCareParams("", rows)).toEqual({ cluster: null, layout: null, hospital: null, sort: "usual" });
  });
});

describe("withCareParams", () => {
  it("keeps other parameters and leaves defaults out", () => {
    expect(withCareParams("view=planner", { cluster: "NHG Health" })).toBe("view=planner&cluster=NHG+Health");
    expect(withCareParams("cluster=NUHS&sort=hours", { cluster: null, sort: "usual" })).toBe("");
    expect(withCareParams("", { layout: "list", hospital: "SGH" })).toBe("layout=list&hospital=SGH");
    expect(withCareParams("layout=list&hospital=SGH", { hospital: null })).toBe("layout=list");
  });
  it("round-trips through parseCareParams", () => {
    const q = withCareParams("", { cluster: "NHG Health", layout: "map", hospital: "TTSH", sort: "name" });
    expect(parseCareParams(q, rows)).toEqual({ cluster: "NHG Health", layout: "map", hospital: "TTSH", sort: "name" });
  });
});

describe("sortRows uses the Planner cards' orders", () => {
  it("usual: largest change first, no comparison last", () => {
    expect(sortRows(rows, "usual").map((r) => r.code)).toEqual(["TTSH", "SGH", "NUH", "AH"]);
  });
  it("hours: longest first, no figure last", () => {
    expect(sortRows(rows, "hours").map((r) => r.code)).toEqual(["TTSH", "SGH", "AH", "NUH"]);
  });
  it("name: A to Z", () => {
    expect(sortRows(rows, "name").map((r) => r.code)).toEqual(["AH", "NUH", "SGH", "TTSH"]);
  });
  it("does not change the list it is given", () => {
    const before = rows.map((r) => r.code);
    sortRows(rows, "name");
    expect(rows.map((r) => r.code)).toEqual(before);
  });
});

describe("pinned", () => {
  it("drops hospitals the release has no location for", () => {
    expect(pinned([row("A", "x"), row("B", "x", { latitude: null, longitude: null })]).map((r) => r.code)).toEqual(["A"]);
  });
});
