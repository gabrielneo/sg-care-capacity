import { expect, test } from "@playwright/test";

import { blockTiles, expectNoA11yViolations, expectNoHorizontalScroll } from "./helpers";

/*
 * The home page on the API's fixture snapshot (api/tests/fixture_snapshot.py):
 * - SGH: latest complete week (19 Oct) 5.0 h against a usual 4.0 h: +25%, "higher than usual".
 * - AH: an incomplete week among the 8 before, so no usual level: "no comparison".
 * - NUH: no MOH rows at all: no figure, no comparison.
 * - Clinics in Bedok (postcodes 4600xx), one in Tuas; Echo Clinic is inactive. Polyclinics: Bedok, Woodlands.
 */

test.beforeEach(async ({ page }) => blockTiles(page));

test.describe("Home", () => {
  test("the first screen leads with the emergency number, then the search", async ({ page }) => {
    await page.goto("/");
    const band = page.getByTestId("emergency-note");
    await expect(band).toHaveText(/Life-threatening emergency\? Call 995\./);
    await expect(band).toBeInViewport();
    // The band is the first thing on the page, ahead of the heading, and can't be dismissed.
    const firstInHero = await page.getByTestId("home-hero").evaluate((el) => el.firstElementChild?.getAttribute("data-testid"));
    expect(firstInHero).toBe("emergency-note");
    await expect(band.getByRole("button")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Find a clinic near you");
    await expect(page.getByLabel("Your postcode or area")).toBeInViewport();
    await expect(page.getByTestId("nearby")).toHaveCount(0);                     // nothing until a search
    await expect(page.getByTestId("ed-item")).toHaveCount(0);                    // and no hospital is ranked before one
    await expect(page.getByTestId("status-card")).toHaveCount(0);
  });

  test("it says it isn't medical advice, and that a search stays in the browser", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("not-advice")).toHaveText(/isn't medical advice/);
    await expect(page.getByTestId("search-privacy")).toHaveText(/stays in this browser/);
    await page.goto("/#near=460002");
    await expect(page.getByTestId("nearby-basis")).toContainText("the newest list data.gov.sg publishes");
  });

  test("a shared link gets a preview image and the new description", async ({ page, request }) => {
    await page.goto("/");
    const image = await page.locator('meta[property="og:image"]').getAttribute("content");
    expect(image).toMatch(/\/opengraph-image/);
    const res = await request.get(new URL(image!).pathname + new URL(image!).search);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/png");
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /find a GP clinic or polyclinic near you/);
  });

  test("without JavaScript the emergency band is still there, and the finder says it needs JavaScript", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.getByTestId("emergency-note")).toHaveText(/Call 995/);
    await expect(page.getByTestId("not-advice")).toHaveText(/isn't medical advice/);
    await expect(page.getByTestId("needs-js")).toContainText("needs JavaScript");
    await context.close();
  });

  test("the map loads when scrolled to, with every hospital and polyclinic", async ({ page }) => {
    // ?layout=map: below 640px the default layout is the list, which has no map to load.
    await page.goto("/?layout=map#near=460001");
    await expect(page.locator(".leaflet-container")).toHaveCount(0);                // not before it's needed
    await page.getByTestId("care-map").scrollIntoViewIfNeeded();
    await expect(page.locator(".leaflet-container")).toHaveCount(1);
    // 3 hospitals + 2 polyclinics + 4 nearest active GP clinics + the search point.
    await expect(page.locator("path.leaflet-interactive")).toHaveCount(3 + 2 + 4 + 1);
    await expect(page.getByTestId("map-key")).toContainText("Your search");
  });

  test("the weekday pattern and takeaways come from the API (analyst view)", async ({ page, request }) => {
    const body = await (await request.get("http://127.0.0.1:8791/api/v1/insights")).json() as
      { data: { insight_id: string; headline_rank: number | null; chart: { callout: string } | null }[] };
    const top = body.data.filter((i) => i.headline_rank != null && i.chart).sort((a, b) => a.headline_rank! - b.headline_rank!);
    await page.goto("/?view=analyst");
    await expect(page.getByTestId("week-pattern").getByTestId("heatmap")).toBeVisible();
    const items = page.getByTestId("takeaway");
    await expect(items).toHaveCount(Math.min(3, top.length));
    for (let i = 0; i < Math.min(3, top.length); i++) {
      await expect(items.nth(i)).toHaveAttribute("data-insight", top[i]!.insight_id);
      await expect(items.nth(i).getByTestId("takeaway-title")).toHaveText(top[i]!.chart!.callout);
    }
  });

  test("definitions and limits are in a closed drawer that opens", async ({ page }) => {
    await page.goto("/");
    const drawer = page.getByTestId("methods-drawer");
    await expect(drawer).not.toHaveAttribute("open", "");
    await expect(page.getByText("Chance of this by luck (adjusted p)").first()).toBeHidden();
    await drawer.locator("summary").click();
    await expect(page.getByTestId("limits")).toBeVisible();
    await expect(drawer.getByText(/15% or more above usual is higher/)).toBeVisible();
  });

  test("works at this width with no sideways scrolling, and passes axe", async ({ page }) => {
    await page.goto("/#near=460001");
    await expect(page.getByTestId("nearby-place").first()).toBeVisible();
    await expect(page.getByTestId("ed-item")).toHaveCount(3);
    await expectNoHorizontalScroll(page);
    await expectNoA11yViolations(page, { wcag22: true });
  });
});
