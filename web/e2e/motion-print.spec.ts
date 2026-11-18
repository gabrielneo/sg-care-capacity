import { expect, test } from "@playwright/test";

import { expectNoHorizontalScroll } from "./helpers";

/** UX audit D9: nothing is hidden behind motion or JavaScript, and the page prints as a clean light-theme document. */

const ROUTES = [
  { path: "/", name: "Home" },
  { path: "/findings", name: "Findings" },
  { path: "/ed-trends", name: "ED trends" },
];

test.describe("data is on the page on first paint", () => {
  for (const r of ROUTES) {
    test(`${r.name} with JavaScript off: headings, numbers and a dated source line are in the HTML`, async ({ browser }) => {
      const context = await browser.newContext({ javaScriptEnabled: false });
      const page = await context.newPage();
      await page.goto(r.path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const text = await page.locator("main").innerText();
      expect(text).toMatch(/\d+(\.\d+)?\s*(h\b|hours?|%)|\d+\.\d/);          // a bed wait, a percentage or a decimal figure
      expect(text).toMatch(/Data (as of|to) \d{1,2} [A-Z][a-z]{2} \d{4}/);
      // No element is invisible by opacity or hidden by a reveal class.
      const hidden = await page.locator("main [data-section], main section").evaluateAll((els) =>
        els.filter((e) => getComputedStyle(e).opacity === "0" || getComputedStyle(e).visibility === "hidden").length);
      expect(hidden).toBe(0);
      await context.close();
    });
  }

  test("nothing in a long page starts transparent, before any scrolling", async ({ page }) => {
    await page.goto("/ed-trends");
    const transparent = await page.locator("main *").evaluateAll((els) =>
      els.filter((e) => {
        const cs = getComputedStyle(e);
        return cs.opacity === "0" && !e.closest(".sr-only, [aria-hidden='true'], [hidden], .delay-show") && (e as HTMLElement).offsetHeight > 0;
      }).map((e) => e.tagName + "." + e.className));
    expect(transparent).toEqual([]);
  });
});

test.describe("motion", () => {
  test("with reduced motion every animation and transition is off", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/methodology");
    const link = page.locator("main a").first();
    await link.hover();
    expect(await link.evaluate((e) => getComputedStyle(e).transitionProperty)).toBe("none");
    const moving = await page.locator("main a, main button, main summary").evaluateAll((els) =>
      els.filter((e) => { const cs = getComputedStyle(e); return parseFloat(cs.transitionDuration) > 0 || cs.animationName !== "none"; }).length);
    expect(moving).toBe(0);
  });

  test("a link's colour change takes 120 ms", async ({ page }) => {
    await page.goto("/methodology");
    const link = page.locator("main a").first();
    await link.hover();
    expect(await link.evaluate((e) => getComputedStyle(e).transitionDuration)).toContain("0.12s");
    expect(await link.evaluate((e) => getComputedStyle(e).transitionProperty)).toBe("color, background-color, border-color");
  });
});

test.describe("print", () => {
  test("printed ED trends: light theme even if dark is chosen, no chrome, the date and source lines stay, no overflow", async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem("theme", "dark"); } catch { /* storage blocked */ } });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/ed-trends");
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    await page.emulateMedia({ media: "print", colorScheme: "dark" });
    const page_bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(page_bg).toBe("rgb(255, 255, 255)");
    const ink = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bg-page").trim().toUpperCase());
    expect(ink).toBe("#FAF9FF");
    for (const hidden of ["body > header", "body > footer"]) {
      await expect(page.locator(hidden).first()).toBeHidden();
    }
    await expect(page.getByTestId("provenance-line").first()).toBeVisible();
    const band = await page.locator(".section-band").first().evaluate((e) => getComputedStyle(e).boxShadow);
    expect(band).toBe("none");                                                    // no full-bleed band colour on paper
    await expectNoHorizontalScroll(page);
  });

  test("a chart is not split across print pages", async ({ page }) => {
    await page.emulateMedia({ media: "print" });
    await page.goto("/ed-trends");
    const breaks = await page.locator('[data-testid="chart-frame"]').first().evaluate((e) => getComputedStyle(e).breakInside);
    expect(breaks).toBe("avoid");
  });
});
