import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { countDataAsOf, normaliseColour, summarise, typeBudgetProblems, type RawPage } from "@/scripts/ui-metrics";
import { hospitalRoute, ROUTES } from "@/tests/visual/routes";

const WEB = path.resolve(import.meta.dirname, "..");

describe("normaliseColour", () => {
  it("treats rgb and opaque rgba as the same colour", () => {
    expect(normaliseColour("rgb(15, 23, 42)")).toBe("rgb(15,23,42)");
    expect(normaliseColour("rgba(15, 23, 42, 1)")).toBe("rgb(15,23,42)");
    expect(normaliseColour("rgb(15 23 42 / 100%)")).toBe("rgb(15,23,42)");
  });

  it("maps zero alpha and the keyword to transparent", () => {
    expect(normaliseColour("rgba(0, 0, 0, 0)")).toBe("transparent");
    expect(normaliseColour("transparent")).toBe("transparent");
  });

  it("keeps partial alpha distinct, and unknown notations as they are", () => {
    expect(normaliseColour("rgba(0, 0, 0, 0.5)")).toBe("rgba(0,0,0,0.5)");
    expect(normaliseColour("oklch(0.5 0.1 200)")).toBe("oklch(0.5,0.1,200)");
    expect(normaliseColour("oklch(0.5, 0.1, 200)")).toBe("oklch(0.5,0.1,200)");
  });
});

describe("countDataAsOf", () => {
  it("counts every occurrence, any case", () => {
    expect(countDataAsOf("Data as of 1 Nov 2026 · Source: MOH\nDATA AS OF 2 Nov\ndata as of")).toBe(3);
    expect(countDataAsOf("as of 1 Nov")).toBe(0);
    // "Data to" is the other way a date is stated (a finding's window); "data tools" is not.
    expect(countDataAsOf("Data to 7 Nov 2026 and data as of 7 Nov; data tools")).toBe(2);
  });
});

describe("summarise", () => {
  const raw: RawPage = {
    text: [
      { fontSize: "16px", color: "rgb(15, 23, 42)" },
      { fontSize: "13px", color: "rgba(15, 23, 42, 1)" },
      { fontSize: "12.5px", color: "rgb(71, 85, 105)" },
      { fontSize: "16px", color: "rgb(71, 85, 105)" },
    ],
    backgrounds: ["rgba(0, 0, 0, 0)", "rgb(255, 255, 255)", "rgb(255,255,255)", "rgb(248, 250, 252)"],
    innerText: "Data as of 1 Nov 2026\nData as of 1 Nov 2026",
    scrollHeight: 4200,
    scrollWidth: 390,
    clientWidth: 375,
    maxRight: 401.2,
  };

  it("counts distinct sizes and colours, small text, as-of lines and overflow", () => {
    expect(summarise(raw, 375)).toEqual({
      fontSizes: 3,
      fontSizeList: [12.5, 13, 16],
      smallText: 1,
      textColours: 2,
      backgroundColours: 2,
      pageHeight: 4200,
      dataAsOf: 2,
      overflow: { page: 15, element: 27 },
    });
  });

  it("reports no overflow as 0, never negative", () => {
    const m = summarise({ ...raw, scrollWidth: 375, maxRight: 300 }, 375);
    expect(m.overflow).toEqual({ page: 0, element: 0 });
  });
});

describe("visual routes", () => {
  it("cover the routes in the redesign brief, with unique names", () => {
    const names = ROUTES.map((r) => r.name);
    expect(new Set(names).size).toBe(names.length);
    expect(ROUTES.map((r) => r.path)).toEqual([
      "/", "/find", "/project", "/findings", "/explore", "/ed-trends",
      "/access-map", "/live", "/data-quality", "/methodology", "/glossary", "/how-its-built", "/case-study",
      "/docs/insights-method",
    ]);
  });

  it("build a per-hospital page from the hospital's code", () => {
    expect(hospitalRoute("SGH")).toEqual({ name: "ed-trends-hospital-sgh", path: "/ed-trends?hospital=SGH" });
  });
});

describe("baseline and metrics stay out of the default e2e run", () => {
  it("the default Playwright config only reads ./e2e", () => {
    expect(readFileSync(path.join(WEB, "playwright.config.ts"), "utf8")).toMatch(/testDir: "\.\/e2e"/);
  });

  it("no e2e spec carries the @baseline or @metrics tag", () => {
    for (const f of readdirSync(path.join(WEB, "e2e")).filter((n) => n.endsWith(".ts"))) {   // not the snapshot folders
      expect(readFileSync(path.join(WEB, "e2e", f), "utf8"), f).not.toMatch(/@baseline|@metrics/);
    }
  });
});

describe("typeBudgetProblems", () => {
  it("passes six sizes, all 13px or larger", () => {
    expect(typeBudgetProblems({ fontSizes: 6, fontSizeList: [13, 14, 16, 18, 24, 36], smallText: 0 })).toEqual([]);
  });
  it("names a seventh size and any text under 13px", () => {
    expect(typeBudgetProblems({ fontSizes: 7, fontSizeList: [12, 13, 14, 16, 18, 24, 36], smallText: 3 })).toEqual([
      "7 font sizes (max 6): 12, 13, 14, 16, 18, 24, 36",
      "3 text elements under 13px",
    ]);
  });
});
