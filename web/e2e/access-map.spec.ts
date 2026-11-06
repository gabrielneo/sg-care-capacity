import { expect, test } from "@playwright/test";

import { blockTiles, expectAsOfOnEveryCard, expectNoA11yViolations, expectNoHorizontalScroll, seen } from "./helpers";

test.beforeEach(async ({ page }) => blockTiles(page));

test.describe("Access Map", () => {
  test("draws the areas with a quantile legend, attribution and an as-of date", async ({ page }) => {
    await page.goto("/access-map");
    await expect(page.locator("[data-area]")).toHaveCount(2);
    const legend = await seen(page.getByTestId("map-legend"));
    expect(legend).toContain("CHAS GP clinics per 1,000 residents aged 65+");
    expect(legend).toContain("five groups with equal numbers of areas");
    expect(legend).toContain("No data (1 area");                           // Tuas: no residents
    const attribution = page.locator(".leaflet-control-attribution");
    await expect(attribution).toContainText("OneMap");
    await expect(attribution).toContainText("Singapore Land Authority");
    await expect(attribution.locator('img[src*="om_logo"]')).toHaveCount(1);
    await expectAsOfOnEveryCard(page, 1);
    await expectNoHorizontalScroll(page);
  });

  test("the metric switcher changes the legend", async ({ page }) => {
    await page.goto("/access-map");
    await page.getByLabel("Measure").selectOption("pct_area_within_1km_of_cdmp");
    await expect.poll(() => seen(page.getByTestId("map-legend"))).toContain("Share of land within 1 km of a CDMP clinic");
    await page.getByLabel("Measure").selectOption("approx_km_centroid_to_nearest_polyclinic");
    await expect.poll(() => seen(page.getByTestId("map-legend"))).toContain("Darker means farther: worse access.");
  });

  test("clinic points can be limited to CDMP clinics", async ({ page }) => {
    await page.goto("/access-map");
    const count = page.locator("fieldset p[aria-live]");
    await expect.poll(() => seen(count)).toBe("4 CHAS GP clinics shown as white dots.");   // the inactive clinic is not shown
    await page.getByRole("checkbox", { name: "CDMP only" }).check();
    await expect.poll(() => seen(count)).toBe("2 CDMP GP clinics shown as white dots.");
  });

  test("an area opens its panel from the keyboard, with its data note", async ({ page }) => {
    await page.goto("/access-map");
    await page.locator('[data-area="TS"]').focus();
    await page.keyboard.press("Enter");
    const panel = page.getByTestId("area-panel");
    await expect(panel).toContainText("Tuas");
    await expect(panel).toContainText("no residents");
    await expect(panel.getByRole("heading", { name: /Tuas/ })).toBeFocused();
    await panel.getByRole("button", { name: /Close/ }).click();
    await expect(panel).toHaveCount(0);
  });

  test("the table view lists the same areas and sorts", async ({ page }) => {
    await page.goto("/access-map?view=table");
    const table = page.getByTestId("area-table");
    await expect(table.locator("tbody tr")).toHaveCount(2);
    await expect(table.locator("tbody tr").first()).toContainText("Bedok");
    await table.getByRole("link", { name: /CHAS GP clinics per 1,000/ }).click();
    await expect(page).toHaveURL(/sort=clinics_per_1k_seniors&dir=asc/);
    await expect(table.locator("tbody tr").last()).toContainText("No data");          // missing values last
    await expectAsOfOnEveryCard(page, 1);
  });

  for (const path of ["/access-map", "/access-map?view=table"]) {
    test(`passes axe WCAG 2.1 AA checks (${path})`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByTestId("chart-card")).toBeVisible();
      await expectNoA11yViolations(page);
    });
  }
});
