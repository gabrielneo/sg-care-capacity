import { expect, test } from "@playwright/test";

import { blockTiles } from "./helpers";

/** Reading rhythm (docs/design/redesign_brief.md): prose is never wider than 68 characters; the methods drawer uses the width it has. */

test.describe("D7: the methods drawer", () => {
  test("the definitions sit in two columns from 1024px, one column below", async ({ page }) => {
    await blockTiles(page);
    await page.goto("/find");
    const drawer = page.getByTestId("methods-drawer");
    await drawer.locator(":scope > summary").click();
    const items = page.getByTestId("methods-definitions").locator("> div");
    expect(await items.count()).toBeGreaterThanOrEqual(3);
    const box = async (i: number) => (await items.nth(i).boundingBox())!;
    const a = await box(0), b = await box(1), c = await box(2);
    if ((page.viewportSize()?.width ?? 0) >= 1024) {
      expect(Math.abs(a.y - b.y), "first two share a row").toBeLessThan(2);
      expect(c.y, "third starts a new row").toBeGreaterThan(a.y + 20);
    } else {
      expect(b.y, "stacked").toBeGreaterThan(a.y + 20);
    }
  });
});
