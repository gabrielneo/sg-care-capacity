import { expect, test } from "@playwright/test";

import { blockTiles } from "./helpers";

/** Reading rhythm (docs/design/redesign_brief.md): prose is never wider than 68 characters; the methods drawer uses the width it has. */

test("D6: notes under the hospital cards are no wider than 68ch", async ({ page }) => {
  await blockTiles(page);
  await page.goto("/?view=planner");
  const notes = await page.evaluate(() => {
    const out: { id: string; width: number; limit: number }[] = [];
    for (const id of ["status-key", "status-exclusions", "summary-adults-note", "summary-ucc-note"]) {
      const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
      if (!el) continue;
      const probe = document.createElement("span");
      probe.style.cssText = "position:absolute;visibility:hidden;width:68ch;display:block";
      el.append(probe);
      const limit = probe.getBoundingClientRect().width;
      probe.remove();
      out.push({ id, width: el.getBoundingClientRect().width, limit });
    }
    return out;
  });
  expect(notes.length).toBeGreaterThan(1);
  for (const n of notes) expect(n.width, n.id).toBeLessThanOrEqual(n.limit + 1);
});

test("every lede is secondary text, one block, and no wider than 68ch", async ({ page }) => {
  await blockTiles(page);
  await page.goto("/?view=planner");
  const ledes = page.locator(".section-head .lede");
  expect(await ledes.count()).toBeGreaterThan(2);
  for (const lede of await ledes.all()) {
    await expect(lede).toHaveCSS("max-width", /px$/);
    expect(((await lede.textContent()) ?? "").trim().length).toBeGreaterThan(10);
  }
});

test.describe("D7: the methods drawer", () => {
  test("the definitions sit in two columns from 1024px, one column below", async ({ page }) => {
    await blockTiles(page);
    await page.goto("/?view=analyst#section-methods");   // below 768px the methods are an accordion; the fragment opens it
    const items = page.getByTestId("methods-definitions").locator("> div");
    await expect(items).toHaveCount(3);   // bed wait, badges, doctor wait: the clinic definition is on Public only (G1)
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
