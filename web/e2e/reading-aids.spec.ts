import { expect, type Page, test } from "@playwright/test";

import { blockTiles, expectNoA11yViolations, expectNoHorizontalScroll } from "./helpers";

/*
 * Reading aids on the long pages (UX audit I2, G1, E-series): what each view shows and in what order, banding, the right-hand
 * "On this page" list with scroll-spy, the phone accordions with their fragment, and the page-height budgets at 375px.
 * Both projects run this file (1280 and 375).
 */
const narrow = (page: Page) => (page.viewportSize()?.width ?? 1280) < 768;
const wide = (page: Page) => (page.viewportSize()?.width ?? 1280) >= 1280;
const SCREEN = 812;   // a 375px phone's window, as in the audit

/** The section ids on the page, top to bottom. */
const order = (page: Page) => page.locator("[data-section]").evaluateAll((els) => els.map((e) => e.getAttribute("data-section")));

test.beforeEach(async ({ page }) => blockTiles(page));

test.describe("each view shows what its reader needs, in order", () => {
  test("public", async ({ page }) => {
    await page.goto("/find");
    expect(await order(page)).toEqual(["notice", "finder", "ednear", "map", "methods"]);
  });

  test("planner: notice, KPIs, cards (urgent care row included), takeaways; no methods, no clinics", async ({ page }) => {
    await page.goto("/find?view=planner");
    const ids = await order(page);
    expect(ids).toEqual(["notice", "summary", "hospitals", "takeaways"]);
    await expect(page.locator('[data-group="ucc"] [data-testid=status-card][data-hospital="AH"]')).toHaveCount(1);
    await expect(page.getByTestId("to-analyst")).toHaveAttribute("href", /view=analyst/);
    await expect(page.getByTestId("what-changed")).toHaveCount(0);
    await expect(page.getByText("Clinics near you")).toHaveCount(0);
  });

  test("analyst: the chapters, with evidence on each takeaway, and no clinic methods (G1)", async ({ page }) => {
    await page.goto("/find?view=analyst#section-methods");
    expect(await order(page)).toEqual(["notice", "summary", "hospitals", "changes", "takeaways", "weekdays", "methods"]);
    expect(await page.locator("[data-chapter]").evaluateAll((els) => els.map((e) => e.getAttribute("data-tone")))).toEqual(["page", "band", "page", "band", "page"]);
    const n = await page.getByTestId("takeaway").count();
    await expect(page.getByTestId("takeaway-evidence")).toHaveCount(n);
    await expect(page.getByText("Clinics near you")).toHaveCount(0);
  });

  test("analyst: every band ends with Back to top, which goes to the top; planner (short) has none", async ({ page }) => {
    await page.goto("/find?view=analyst#section-methods");
    await expect(page.getByTestId("back-to-top")).toHaveCount(2);
    const link = page.getByTestId("back-to-top").first();
    await link.scrollIntoViewIfNeeded();
    await link.click();
    await expect(page).toHaveURL(/#main$/);
    await page.goto("/find?view=planner");
    await expect(page.getByTestId("back-to-top")).toHaveCount(0);
  });
});

test.describe("On this page", () => {
  test("analyst: a sticky list from 1280px with the section in view marked; a Jump menu on phones", async ({ page }) => {
    await page.goto("/find?view=analyst");
    const rail = page.getByTestId("on-this-page");
    if (wide(page)) {
      await expect(rail).toBeVisible();
      await expect(rail.getByRole("link", { name: "Summary" })).toHaveAttribute("aria-current", "location");
      await page.locator("#section-takeaways").scrollIntoViewIfNeeded();
      await page.evaluate(() => document.getElementById("section-takeaways")!.scrollIntoView({ block: "start" }));
      await expect(rail.getByRole("link", { name: "Takeaways" })).toHaveAttribute("aria-current", "location");
      await expect(rail.getByRole("link", { name: "Summary" })).not.toHaveAttribute("aria-current");
      // Sticky: still in the window after scrolling a long way.
      const box = (await rail.boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(900);
      await expect(page.getByTestId("jump-menu")).toBeHidden();
    } else {
      await expect(rail).toBeHidden();
      if (narrow(page)) {
        const menu = page.getByTestId("jump-menu");
        await expect(menu).toBeVisible();
        await menu.locator("summary").click();
        await menu.getByRole("link", { name: "Takeaways" }).click();
        await expect(page).toHaveURL(/#section-takeaways$/);
      }
    }
  });

  test("planner and public have no list", async ({ page }) => {
    for (const url of ["/find?view=planner", "/find"]) {
      await page.goto(url);
      await expect(page.getByTestId("on-this-page")).toBeHidden();
    }
  });

  test("findings and methodology have it from their wide layout, and a menu below it", async ({ page }) => {
    for (const url of ["/findings", "/methodology"]) {
      await page.goto(url);
      if (wide(page)) await expect(page.getByTestId("on-this-page")).toBeVisible();
      else {
        await expect(page.getByTestId("on-this-page")).toBeHidden();
        await expect(page.getByTestId("jump-menu")).toBeVisible();
      }
      await expectNoHorizontalScroll(page);
    }
  });
});

test.describe("accordions on phones (I2)", () => {
  test("below 768px the heatmap and the methods are closed, and the fragment keeps the state", async ({ page }) => {
    test.skip(!narrow(page), "phones only");
    await page.goto("/find?view=analyst");
    const heat = page.getByTestId("accordion-section-weekdays");
    const methods = page.getByTestId("accordion-section-methods");
    await expect(heat).not.toHaveAttribute("open", "");
    await expect(methods).not.toHaveAttribute("open", "");
    await expect(page.locator("[data-testid=heatmap-compact]:visible")).toHaveCount(0);

    await heat.locator(":scope > summary").click();
    await expect(page).toHaveURL(/#section-weekdays$/);
    await expect(page.locator("[data-testid=heatmap-compact]:visible")).toHaveCount(1);
    await heat.locator(":scope > summary").click();
    await expect(page).not.toHaveURL(/#/);

    // A shared link opens it.
    await page.goto("/find?view=analyst#section-methods");
    await expect(page.getByTestId("accordion-section-methods")).toHaveAttribute("open", "");
    await expect(page.getByTestId("limits")).toBeVisible();
    await expect(page.getByTestId("accordion-section-weekdays")).not.toHaveAttribute("open", "");
  });

  test("from 768px there is no accordion: the sections are always open", async ({ page }) => {
    test.skip(narrow(page), "wide only");
    await page.goto("/find?view=analyst");
    await expect(page.getByTestId("accordion-section-weekdays")).toHaveCount(0);
    await expect(page.getByTestId("week-pattern")).toBeVisible();
  });
});

test.describe("page height at 375px", () => {
  test("planner is at most 5 screens and analyst at most 7", async ({ page }) => {
    test.skip(!narrow(page), "phones only");
    for (const [url, screens] of [["/find?view=planner", 5], ["/find?view=analyst", 7]] as const) {
      await page.goto(url);
      await page.waitForLoadState("networkidle");
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      expect(height, `${url}: ${(height / SCREEN).toFixed(1)} screens`).toBeLessThanOrEqual(screens * SCREEN);
    }
  });
});

test("no sideways scrolling and no axe violations on the changed views", async ({ page }) => {
  for (const url of ["/find?view=planner", "/find?view=analyst", "/find"]) {
    await page.goto(url);
    await expectNoHorizontalScroll(page);
    await expectNoA11yViolations(page, { wcag22: true });
  }
});
