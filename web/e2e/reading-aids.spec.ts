import { expect, type Page, test } from "@playwright/test";

import { blockTiles, expectNoA11yViolations, expectNoHorizontalScroll } from "./helpers";

/*
 * Reading aids (UX audit I2, G1, E-series): the clinic finder's sections in order with their banding, and the right-hand
 * "On this page" list on the long pages (a "Jump to section" menu below their wide layout). The Planner and Analyst views,
 * with their accordions and page-height budgets, were removed on 18 Nov 2026.
 * Both projects run this file (1280 and 375).
 */
const wide = (page: Page) => (page.viewportSize()?.width ?? 1280) >= 1280;

/** The section ids on the page, top to bottom. */
const order = (page: Page) => page.locator("[data-section]").evaluateAll((els) => els.map((e) => e.getAttribute("data-section")));

test.beforeEach(async ({ page }) => blockTiles(page));

test("the finder: its sections in order, alternating page and band, and no contents list", async ({ page }) => {
  await page.goto("/find");
  expect(await order(page)).toEqual(["notice", "finder", "ednear", "map", "methods"]);
  expect(await page.locator("[data-chapter]").evaluateAll((els) => els.map((e) => e.getAttribute("data-tone")))).toEqual(["page", "band", "page", "band"]);
  await expect(page.getByTestId("on-this-page")).toBeHidden();
});

test("findings and methodology have a contents list from their wide layout, and a menu below it", async ({ page }) => {
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

test("the finder: no sideways scrolling and no axe violations", async ({ page }) => {
  await page.goto("/find");
  await expectNoHorizontalScroll(page);
  await expectNoA11yViolations(page, { wcag22: true });
});
