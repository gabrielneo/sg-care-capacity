import { expect, test } from "@playwright/test";

import { collectRaw, summarise, typeBudgetProblems } from "../scripts/ui-metrics";
import { blockTiles } from "./helpers";

/**
 * The type budget (docs/design/redesign_brief.md): on every route, at most 6 distinct font sizes and no text under 13px.
 * Runs at 1280 px (desktop project) and 375 px (mobile project). Measured by scripts/ui-metrics.ts, the same code
 * as `npm run ui:metrics`, so the report and the check can't disagree.
 */
const ROUTES = ["/", "/find", "/project", "/findings", "/explore", "/ed-trends",
  "/access-map", "/live", "/data-quality", "/methodology", "/glossary", "/case-study", "/docs/insights-method",
  "/summary", "/about", "/styleguide"];

for (const route of ROUTES) {
  test(`${route}: at most 6 font sizes, none under 13px`, async ({ page }) => {
    await blockTiles(page);
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    await page.evaluate(async () => { await document.fonts.ready; });
    // The map's controls (zoom, attribution) only exist once it has loaded: a route with a map is measured with it.
    if (await page.locator("[data-testid=\"map-section\"], [data-testid=\"care-map\"], .leaflet-container").count()) {
      await page.locator(".leaflet-container").first().waitFor({ timeout: 10_000 }).catch(() => undefined);
    }
    const width = page.viewportSize()?.width ?? 1280;
    const metrics = summarise(await page.evaluate(collectRaw), width);
    expect(typeBudgetProblems(metrics), `${route} at ${width}px`).toEqual([]);
  });
}
