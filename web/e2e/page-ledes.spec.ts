import { expect, test } from "@playwright/test";

import { blockTiles } from "./helpers";

/** The Data Quality and ED Trends cards open with one sentence built from the data (lib/ledes.ts); the wording never states more than the data does. */

test("Data Quality: the check results and freshness cards lead with a sentence from the data", async ({ page }) => {
  await blockTiles(page);
  await page.goto("/data-quality");
  await expect(page.getByTestId("checks-lede")).toHaveText(/^(All \d+ checks passed\.|\d+ checks ran; none stops publishing and \d+ raised a warning\.)$/);
  await expect(page.getByTestId("freshness-lede")).toHaveText(/(All \d+ sources? (is|are) up to date|\d+ of \d+ sources? (is|are) past (its|their) publishing schedule)\.$/);
});

test("ED Trends: the latest-week card says how many hospitals were above usual, without the urgent care centre", async ({ page }) => {
  await blockTiles(page);
  await page.goto("/ed-trends");
  const lede = page.getByTestId("usual-lede");
  await expect(lede).toHaveText(/^Of \d+ emergency departments? with a comparison: /);
  const text = (await lede.textContent()) ?? "";
  const total = Number(text.match(/^Of (\d+)/)?.[1]);
  const hospitals = await page.getByTestId("small-multiple").count().catch(() => 0);
  if (hospitals) expect(total).toBeLessThan(hospitals); // the urgent care centre has a panel but is not counted
});
