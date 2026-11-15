import { describe, expect, it } from "vitest";

import { chaptersFor, densityOf, parseView, SECTIONS, type SectionSpec, sectionsFor, viewHref, VIEWS } from "./homeViews";

const ids = (view: Parameters<typeof sectionsFor>[0]) => sectionsFor(view).map((s) => s.id);

describe("parseView", () => {
  it("reads the three views", () => {
    expect(parseView("public")).toBe("public");
    expect(parseView("planner")).toBe("planner");
    expect(parseView("analyst")).toBe("analyst");
  });

  it("falls back to public for anything else", () => {
    for (const v of [undefined, null, "", "Planner", "admin", "analyst ", "public,planner"]) expect(parseView(v)).toBe("public");
    expect(parseView([])).toBe("public");
  });

  it("uses the first value when the parameter is repeated", () => {
    expect(parseView(["analyst", "planner"])).toBe("analyst");
    expect(parseView(["bogus", "planner"])).toBe("public");
  });
});

describe("sectionsFor", () => {
  it("public: notice, clinic finder, the nearest EDs, map; not the list of every hospital", () => {
    expect(ids("public")).toEqual(["notice", "finder", "ednear", "map", "methods"]);
    expect(densityOf("public", "hospitals")).toBeNull();
  });

  it("planner: notice, KPI tiles, ED cards, top three takeaways; no methods, no clinics (G1)", () => {
    expect(ids("planner")).toEqual(["notice", "summary", "hospitals", "takeaways"]);
    expect(densityOf("planner", "hospitals")).toBe("full");
    expect(densityOf("planner", "takeaways")).toBe("simple");
  });

  it("analyst: planner's sections plus what changed, the weekday heatmap and how the figures are made, in that order", () => {
    expect(ids("analyst")).toEqual(["notice", "summary", "hospitals", "changes", "takeaways", "weekdays", "methods"]);
    for (const s of sectionsFor("planner")) if (s.id !== "methods") expect(ids("analyst")).toContain(s.id);
    expect(densityOf("analyst", "takeaways")).toBe("full");
    expect(densityOf("analyst", "methods")).toBe("full");
  });

  it("keeps the emergency notice on every view, and the figures' definitions where a view explains them", () => {
    for (const v of VIEWS) {
      expect(ids(v.id)).toContain("notice");
      // Hospital figures: the full list on Planner and Analyst, the nearest three on Public.
      expect(ids(v.id).some((id) => id === "hospitals" || id === "ednear")).toBe(true);
    }
    expect(ids("public")).toContain("methods");
    expect(ids("analyst")).toContain("methods");
  });

  it("keeps the config's order, and every section appears in some view", () => {
    const order = SECTIONS.map((s) => s.id);
    for (const v of VIEWS) expect(ids(v.id)).toEqual(order.filter((id) => ids(v.id).includes(id)));
    for (const s of SECTIONS) expect(Object.keys(s.views).length).toBeGreaterThan(0);
    expect(new Set(order).size).toBe(order.length);
  });

  it("filters any config it is given", () => {
    const config: SectionSpec[] = [{ id: "map", chapter: "map", views: { analyst: "simple" } }, { id: "notice", chapter: "start", views: { public: "full" } }];
    expect(sectionsFor("analyst", config)).toEqual([{ id: "map", density: "simple", chapter: "map" }]);
    expect(sectionsFor("planner", config)).toEqual([]);
    expect(densityOf("planner", "map", config)).toBeNull();
  });
});

describe("viewHref", () => {
  it("leaves the view out of the address for public", () => {
    expect(viewHref("public")).toBe("/");
    expect(viewHref("public", "view=analyst")).toBe("/");
    expect(viewHref("planner")).toBe("/?view=planner");
  });

  it("keeps the rest of the query string", () => {
    expect(viewHref("analyst", "sort=hours")).toBe("/?sort=hours&view=analyst");
    expect(viewHref("public", "sort=hours&view=planner")).toBe("/?sort=hours");
    expect(viewHref("planner", new URLSearchParams({ view: "bogus", sort: "name" }))).toBe("/?sort=name&view=planner");
  });
});

describe("chaptersFor", () => {
  const tones = (v: Parameters<typeof sectionsFor>[0]) => chaptersFor(sectionsFor(v)).map((c) => `${c.tone}:${c.items.map((i) => i.id).join("+")}`);

  it("analyst: intro page, KPIs and cards band, takeaways page, heatmap band, methods page", () => {
    expect(tones("analyst")).toEqual(["page:notice", "band:summary+hospitals", "page:changes+takeaways", "band:weekdays", "page:methods"]);
  });

  it("planner and public alternate too", () => {
    expect(tones("planner")).toEqual(["page:notice", "band:summary+hospitals", "page:takeaways"]);
    expect(tones("public")).toEqual(["page:notice+finder", "band:ednear", "page:map", "band:methods"]);
  });

  it("never puts two chapters of the same tone side by side", () => {
    for (const v of VIEWS) chaptersFor(sectionsFor(v.id)).forEach((c, i, all) => { if (i) expect(c.tone).not.toBe(all[i - 1]!.tone); });
  });
});

describe("clinic methods (G1)", () => {
  it("only Public has a methods section that can describe clinics; Planner has none", () => {
    expect(densityOf("planner", "methods")).toBeNull();
  });
});
