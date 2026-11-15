import { expect, test } from "@playwright/test";

import { blockTiles } from "./helpers";

/** E1: the date and source are stated once per section (the section's header); tiles and cards inherit them. */

for (const view of ["analyst", "planner"] as const) {
  test(`/?view=${view}: at most one "Data as of" / "Data to" per section`, async ({ page }) => {
    await blockTiles(page);
    await page.goto(`/?view=${view}`);
    const counts = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('[id^="section-"]')].map((el) => ({
        id: el.id, n: (el.innerText.match(/data (?:as of|to)\b/gi) ?? []).length,
      })));
    expect(counts.length).toBeGreaterThan(3);
    for (const c of counts) expect(c.n, c.id).toBeLessThanOrEqual(1);
  });
}

test("a summary tile scrolls to its hospital card and the card is highlighted", async ({ page }) => {
  await blockTiles(page);
  await page.goto("/?view=analyst");
  await page.getByTestId("summary-tile").filter({ hasText: "Longest bed wait" }).getByRole("link").click();
  await expect(page).toHaveURL(/#hospital-[A-Z]+$/);
  const card = page.locator("[data-testid=status-card]:target");
  await expect(card).toBeInViewport();
  await expect(card).toHaveCSS("outline-style", "solid");
});

test("the four tiles are the same height when they share a row", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1024, "the tiles stack on a phone, where each is as tall as its own text");
  await blockTiles(page);
  await page.goto("/?view=analyst");
  const heights = await page.getByTestId("kpi-tile").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
  expect(heights).toHaveLength(4);
  expect(new Set(heights).size).toBe(1);
});
