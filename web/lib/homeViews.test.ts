import { describe, expect, it } from "vitest";

import { densityOf, parseView, SECTIONS, type SectionSpec, sectionsFor, viewHref, VIEWS } from "./homeViews";

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
  it("public: notice, clinic finder, simple hospital cards, map", () => {
    expect(ids("public")).toEqual(["notice", "finder", "hospitals", "map", "methods"]);
    expect(densityOf("public", "hospitals")).toBe("simple");
  });

  it("planner: summary strip, full hospital cards, takeaways", () => {
    expect(ids("planner")).toEqual(["notice", "summary", "hospitals", "takeaways", "methods"]);
    expect(densityOf("planner", "hospitals")).toBe("full");
  });

  it("analyst: everything in planner, plus the weekday pattern, links and the statistics", () => {
    expect(ids("analyst")).toEqual(["notice", "summary", "hospitals", "takeaways", "weekdays", "links", "methods"]);
    for (const s of sectionsFor("planner")) expect(ids("analyst")).toContain(s.id);
    expect(densityOf("planner", "methods")).toBe("simple");
    expect(densityOf("analyst", "methods")).toBe("full");
  });

  it("keeps the emergency notice and the definitions on every view", () => {
    for (const v of VIEWS) {
      expect(ids(v.id)).toContain("notice");
      expect(ids(v.id)).toContain("methods");
      expect(ids(v.id)).toContain("hospitals");
    }
  });

  it("keeps the config's order, and every section appears in some view", () => {
    const order = SECTIONS.map((s) => s.id);
    for (const v of VIEWS) expect(ids(v.id)).toEqual(order.filter((id) => ids(v.id).includes(id)));
    for (const s of SECTIONS) expect(Object.keys(s.views).length).toBeGreaterThan(0);
    expect(new Set(order).size).toBe(order.length);
  });

  it("filters any config it is given", () => {
    const config: SectionSpec[] = [{ id: "map", views: { analyst: "simple" } }, { id: "notice", views: { public: "full" } }];
    expect(sectionsFor("analyst", config)).toEqual([{ id: "map", density: "simple" }]);
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

  it("keeps the search", () => {
    expect(viewHref("analyst", "near=460001")).toBe("/?near=460001&view=analyst");
    expect(viewHref("public", "near=460001&view=planner")).toBe("/?near=460001");
    expect(viewHref("planner", new URLSearchParams({ view: "bogus", near: "Bedok" }))).toBe("/?near=Bedok&view=planner");
  });
});
