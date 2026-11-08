import { expect, test } from "@playwright/test";

import { blockTiles, expectAsOfOnEveryCard, expectNoA11yViolations, expectNoHorizontalScroll, seen } from "./helpers";

test.beforeEach(async ({ page }) => blockTiles(page));

test.describe("Access Map", () => {
  test("draws the areas with a quantile legend, attribution and an as-of date", async ({ page }) => {
    await page.goto("/access-map?view=map");
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
    await page.goto("/access-map?view=map");
    await page.getByLabel("Measure").selectOption("pct_area_within_1km_of_cdmp");
    await expect.poll(() => seen(page.getByTestId("map-legend"))).toContain("Share of land within 1 km of a CDMP clinic");
    await page.getByLabel("Measure").selectOption("approx_km_centroid_to_nearest_polyclinic");
    await expect.poll(() => seen(page.getByTestId("map-legend"))).toContain("Darker means farther: worse access.");
  });

  test("clinic points can be limited to CDMP clinics", async ({ page }) => {
    await page.goto("/access-map?view=map");
    const count = page.locator("fieldset p[aria-live]");
    await expect.poll(() => seen(count)).toBe("4 CHAS GP clinics shown as white dots.");   // the inactive clinic is not shown
    await page.getByRole("checkbox", { name: "CDMP only" }).check();
    await expect.poll(() => seen(count)).toBe("2 CDMP GP clinics shown as white dots.");
  });

  test("an area opens its panel from the keyboard, with its data note", async ({ page }) => {
    await page.goto("/access-map?view=map");
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

  for (const path of ["/access-map?view=map", "/access-map?view=table"]) {
    test(`passes axe WCAG 2.1 AA checks (${path})`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByTestId("chart-card").first()).toBeVisible();
      await expectNoA11yViolations(page);
    });
  }
});

const noWebGL = () => {
  const original = HTMLCanvasElement.prototype.getContext;
  // @ts-expect-error: a browser without WebGL answers null for these contexts
  HTMLCanvasElement.prototype.getContext = function (type: string, ...rest: unknown[]) {
    return /webgl/i.test(type) ? null : original.call(this, type as "2d", ...(rest as []));
  };
};

test.describe("Access Map in 3D", () => {
  test("is the default where WebGL works: reading guide, legend, priority labels", async ({ page }, info) => {
    await page.goto("/access-map");
    await expect(page.getByTestId("access-views")).toHaveAttribute("data-view", "3d");
    await expect(page.getByTestId("map3d").locator("canvas")).toBeVisible();
    await expect(page.getByTestId("reading-guide")).toHaveText(
      "Taller = more seniors. Darker = fewer chronic-care clinics per senior. Tall and dark areas need attention first.");
    await expect(page.getByTestId("height-scale")).toContainText("Height: 10,000 residents aged 65+ per step.");
    await expect(page.getByTestId("legend-excluded")).toContainText("Flat and grey: fewer than 1,000 residents aged 65+, so not ranked (1 area)");
    // The access-gap findings name the labels (the fixture has one: Bedok); phones show the number only.
    await expect(page.getByTestId("map3d-label")).toHaveText([info.project.name === "desktop" ? "1. Bedok" : "1"]);
    await expect(page.getByTestId("map3d-key")).toContainText("1 Bedok");
    await expect(page.getByRole("link", { name: "3D map", exact: true })).toHaveAttribute("aria-current", "page");
    await expectNoHorizontalScroll(page);
  });

  test("falls back to the 2D map when WebGL is unavailable, even when 3D is asked for", async ({ page }) => {
    await page.addInitScript(noWebGL);
    for (const path of ["/access-map", "/access-map?view=3d"]) {
      await page.goto(path);
      await expect(page.getByTestId("access-views")).toHaveAttribute("data-view", "2d");
      await expect(page.getByTestId("view-reason")).toContainText("no WebGL");
      await expect(page.locator("[data-area]")).toHaveCount(2);                      // the 2D map's areas
      await expect(page.getByTestId("map3d")).toHaveCount(0);
      await expect(page.getByRole("link", { name: "2D map", exact: true })).toHaveAttribute("aria-current", "page");
    }
  });

  test("reduced motion or low memory mean 2D by default, with 3D one click away", async ({ browser }, info) => {
    const reduced = await browser.newContext({ reducedMotion: "reduce", viewport: info.project.use.viewport ?? undefined });
    const page = await reduced.newPage();
    await page.goto("/access-map");
    await expect(page.getByTestId("access-views")).toHaveAttribute("data-view", "2d");
    await expect(page.getByTestId("view-reason")).toContainText("Reduced motion is on");
    await page.getByRole("link", { name: "Show the 3D map anyway" }).click();
    await expect(page.getByTestId("access-views")).toHaveAttribute("data-view", "3d");
    await reduced.close();

    const small = await browser.newContext({ viewport: info.project.use.viewport ?? undefined });
    const p2 = await small.newPage();
    await p2.addInitScript(() => Object.defineProperty(navigator, "deviceMemory", { get: () => 2 }));
    await p2.goto("/access-map");
    await expect(p2.getByTestId("view-reason")).toContainText("little memory");
    await small.close();
  });

  test("the view toggle switches between 3D, 2D and the table", async ({ page }) => {
    await page.goto("/access-map");
    await expect(page.getByTestId("access-views")).toHaveAttribute("data-view", "3d");
    await page.getByRole("link", { name: "2D map", exact: true }).click();
    await expect(page).toHaveURL(/view=map$/);
    await expect(page.locator("[data-area]")).toHaveCount(2);
    await page.getByRole("link", { name: "Table", exact: true }).click();
    await expect(page).toHaveURL(/view=table$/);
    await expect(page.getByTestId("area-table")).toBeVisible();
    await page.getByRole("link", { name: "3D map", exact: true }).click();
    await expect(page).toHaveURL(/view=3d$/);
    await expect(page.getByTestId("map3d").locator("canvas")).toBeVisible();
  });

  test("the charts beside the map read the same finding, and every chart shows as of", async ({ page }) => {
    await page.goto("/access-map");
    await expect(page.getByTestId("quadrant-chart")).toBeVisible();
    await expect(page.locator("[data-testid=chart-card]").filter({ hasText: "Many seniors, few clinics" })
      .getByTestId("chart-callout")).toHaveText("Bedok: About 1 clinic short of the national rate");
    await expect(page.getByTestId("shortfall-bar")).toHaveText(["Bedokabout 1"]);
    await expectAsOfOnEveryCard(page, 3);                                              // map, quadrant, shortfall
  });

  test("the 3D layer the browser fetches is in metres, from the site (never the API directly)", async ({ page }) => {
    const res = await page.request.get("/access-map/svy21");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.metadata.origin).toEqual([29537, 33000]);
    expect(body.data.features[0].geometry.coordinates[0][0]).toEqual([9000, -1000]);
  });

  test("passes axe WCAG 2.1 AA checks in 3D", async ({ page }) => {
    await page.goto("/access-map");
    await expect(page.getByTestId("map3d").locator("canvas")).toBeVisible();
    await expectNoA11yViolations(page);
  });
});
