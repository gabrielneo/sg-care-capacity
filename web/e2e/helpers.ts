import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page } from "@playwright/test";

export const DOWN = "http://127.0.0.1:3302";

/** Map tiles come from OneMap; tests never depend on the network. */
export async function blockTiles(page: Page) {
  await page.route(/onemap\.gov\.sg\/maps\/tiles/, (route) => route.abort());
}

const AS_OF = /Data as of \d{1,2} [A-Z][a-z]{2,3} \d{4}/;

/**
 * Every chart and KPI tile has its date and source in view: its own line, or (data-provenance="section") the section header's,
 * which must then be on the page. A chart that shows neither fails here, so no figure goes undated.
 */
export async function expectProvenanceOnEveryFrame(page: Page, minimum = 1) {
  const frames = page.locator('[data-testid="chart-frame"], [data-testid="kpi-tile"]');
  await expect(frames.first()).toBeVisible();
  const n = await frames.count();
  expect(n).toBeGreaterThanOrEqual(minimum);
  for (let i = 0; i < n; i++) {
    const frame = frames.nth(i);
    if ((await frame.getAttribute("data-provenance")) === "section") {
      await expect(page.locator('[data-testid=section-meta], [data-testid=provenance-line]:not([data-testid=chart-frame] *)').first(), `frame ${i + 1} of ${n} inherits a section line`).toContainText(AS_OF);
      continue;
    }
    const line = frame.getByTestId("provenance-line");
    await expect(line, `frame ${i + 1} of ${n}`).toBeVisible();
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
