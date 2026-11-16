import { expect, test } from "@playwright/test";

import { blockTiles } from "./helpers";

/*
 * The date and source under a chart (review 2026-11-16, open item 5): the line states them once; the freshness pill, without the
 * date, and "More about these figures" share one row. Measured on the fixture's ED trends page.
 */

test.beforeEach(async ({ page }) => blockTiles(page));

test("under a chart, the pill and the 'More about these figures' toggle sit on one row, below the line", async ({ page }) => {
  await page.goto("/ed-trends");
  const footer = page.getByTestId("chart-frame").first().locator("footer").first();
  const [line, badge, more] = await Promise.all([
    footer.getByTestId("provenance-line").boundingBox(), footer.getByTestId("freshness-badge").boundingBox(), footer.locator("summary").boundingBox()]);
  expect(badge!.y).toBeGreaterThanOrEqual(line!.y + line!.height - 1);
  // One row where it fits. On a 375px phone the pill (181px) and the toggle (173px) need 369px and the footer has about 309px, so they wrap.
  if ((page.viewportSize()?.width ?? 1280) >= 640) expect(Math.abs((badge!.y + badge!.height / 2) - (more!.y + more!.height / 2))).toBeLessThan(8);
  else expect(more!.y).toBeGreaterThanOrEqual(badge!.y + badge!.height - 1);                          // wrapped: the toggle under the pill, never over it
  expect(more!.height).toBeGreaterThanOrEqual(44);                                                  // the toggle keeps its 44px target
  await expect(footer.getByTestId("freshness-badge")).not.toContainText(/as of/i);                  // the date is stated once
});

test("an open 'More about these figures' list takes the whole row, below the toggle", async ({ page }) => {
  await page.goto("/ed-trends");
  const footer = page.getByTestId("chart-frame").first().locator("footer").first();
  const summary = footer.locator("summary");
  await summary.click();
  const [s, list] = await Promise.all([summary.boundingBox(), footer.locator("details ul").boundingBox()]);
  expect(list!.y).toBeGreaterThanOrEqual(s!.y + s!.height - 1);
  const frame = (await footer.boundingBox())!;
  expect(list!.x + list!.width).toBeLessThanOrEqual(frame.x + frame.width + 1);
});
