import { expect, test } from "@playwright/test";

import { blockTiles } from "./helpers";

/** E1: the date and source are stated once per section (the section's header); tiles and cards inherit them. */

test("/find: at most one \"Data as of\" / \"Data to\" per section", async ({ page }) => {
  await blockTiles(page);
  await page.goto("/find");
  const counts = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[id^="section-"]')].map((el) => ({
      id: el.id, n: (el.innerText.match(/data (?:as of|to)\b/gi) ?? []).length,
    })));
  expect(counts.length).toBeGreaterThan(3);
  for (const c of counts) expect(c.n, c.id).toBeLessThanOrEqual(1);
});
