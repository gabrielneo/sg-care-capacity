import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page } from "@playwright/test";

export const DOWN = "http://127.0.0.1:3302";

/** Map tiles come from OneMap; tests never depend on the network. */
export async function blockTiles(page: Page) {
  await page.route(/onemap\.gov\.sg\/maps\/tiles/, (route) => route.abort());
}

const AS_OF = /Data as of \d{1,2} [A-Z][a-z]{2,3} \d{4}/;

/** Every chart card and KPI tile on the page shows a visible "Data as of {date}" and a source. */
export async function expectAsOfOnEveryCard(page: Page, minimum: number) {
  const cards = page.locator('[data-testid="chart-card"], [data-testid="kpi-tile"]');
  await expect(cards.first()).toBeVisible();
  const n = await cards.count();
  expect(n).toBeGreaterThanOrEqual(minimum);
  for (let i = 0; i < n; i++) {
    const line = cards.nth(i).getByTestId("provenance-line");
    await expect(line, `card ${i + 1} of ${n}`).toBeVisible();
    await expect(line).toHaveText(AS_OF);
    await expect(line).toContainText("Source:");
  }
}

/** WCAG 2.1 A and AA rules (axe); with `wcag22`, the 2.2 AA rules as well (new pages opt in). */
export async function expectNoA11yViolations(page: Page, { wcag22 = false }: { wcag22?: boolean } = {}) {
  const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", ...(wcag22 ? ["wcag22aa"] : [])];
  const results = await new AxeBuilder({ page }).withTags(tags).analyze();
  const summary = results.violations.map((v) => `${v.id}: ${v.nodes.length} × ${v.help} (${v.nodes[0]?.target.join(" ")})`);
  expect(summary).toEqual([]);
}

/** No sideways scrolling of the page itself. */
export async function expectNoHorizontalScroll(page: Page) {
  const { scroll, viewport } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  expect(scroll).toBeLessThanOrEqual(viewport);
}

/** What a reader sees: innerText leaves out hidden tooltips (unlike textContent). */
export async function seen(locator: Locator): Promise<string> {
  return (await locator.innerText()).replace(/\s+/g, " ").trim();
}
