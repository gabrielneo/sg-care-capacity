import { expect, test } from "@playwright/test";

import { blockTiles, expectNoA11yViolations, expectNoHorizontalScroll } from "./helpers";

/*
 * The home page on the API's fixture snapshot (api/tests/fixture_snapshot.py):
 * - SGH: latest complete week (19 Oct) 5.0 h against a usual 4.0 h: +25%, "higher than usual".
 * - AH: an incomplete week among the 8 before, so no usual level: "no comparison".
 * - NUH: no MOH rows at all: no figure, no comparison.
 * - Clinics in Bedok (postcodes 4600xx), one in Tuas; Echo Clinic is inactive. Polyclinics: Bedok, Woodlands.
 */
const AS_OF = /^Data as of \d{1,2} [A-Z][a-z]{2,3} \d{4} · Source: .+/;

test.beforeEach(async ({ page }) => blockTiles(page));

test.describe("Home", () => {
  test("the first screen says what the site does, the emergency number, and offers the search", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Check how busy hospital emergency departments are, and find a clinic near you");
    await expect(page.getByTestId("emergency-note")).toHaveText(/call 995/);
    await expect(page.getByTestId("emergency-note")).toBeInViewport();
    await expect(page.getByLabel("Your postcode or area")).toBeInViewport();
    await expect(page.getByTestId("nearby")).toHaveCount(0);                     // nothing until a search
  });

  test("each hospital has a status card, busiest first, with its badge and figure", async ({ page }) => {
    await page.goto("/");
    const cards = page.getByTestId("status-card");
    await expect(cards).toHaveCount(3);
    expect(await cards.evaluateAll((els) => els.map((e) => e.getAttribute("data-hospital")))).toEqual(["SGH", "AH", "NUH"]);

    const sgh = page.locator('[data-testid=status-card][data-hospital="SGH"]');
    await expect(sgh).toHaveAttribute("data-level", "higher");
    await expect(sgh.getByTestId("status-badge")).toHaveText("▲Higher than usual");
    await expect(sgh.getByTestId("status-hours")).toHaveText("5.0 h");
    await expect(sgh.getByTestId("status-sentence")).toHaveText("Bed waits were longer than usual last week. Usual: 4.0 h.");
    await expect(sgh.getByTestId("sparkline")).toBeAttached();
    // Every card names its hospital in full, not only the first.
    for (const card of await cards.all()) await expect(card.getByRole("heading", { level: 3 })).toContainText(/ \([A-Z]+\)/);

    // Missing stays missing: no usual level is "no comparison", never "about usual".
    const ah = page.locator('[data-testid=status-card][data-hospital="AH"]');
    await expect(ah).toHaveAttribute("data-level", "unknown");
    await expect(ah.getByTestId("status-live")).toContainText("To see a doctor: under 1 hour");   // a bound stays a bound
    const nuh = page.locator('[data-testid=status-card][data-hospital="NUH"]');
    await expect(nuh.getByTestId("status-hours")).toHaveText("–");
    await expect(nuh.getByTestId("status-sentence")).toHaveText("No complete week of figures last week.");

    await expect(page.getByTestId("status-grid").getByTestId("provenance-line")).toHaveText(AS_OF);
  });

  test("a postcode a clinic has finds that clinic first, and only active clinics", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Your postcode or area").fill("460002");
    await page.getByRole("button", { name: "Find clinics" }).click();
    await expect(page).toHaveURL(/\?near=460002#nearby$/);
    const nearby = page.getByTestId("nearby");
    await expect(nearby.getByRole("heading", { level: 2 })).toHaveText("Near 460002");
    await expect(nearby.getByTestId("nearby-basis")).toContainText("Distances from that postcode, in a straight line.");
    const gps = nearby.getByTestId("nearby-gps").getByTestId("nearby-place");
    await expect(gps.first()).toContainText("Bravo Clinic");
    await expect(gps.first().getByTestId("nearby-km")).toHaveText("under 0.1 km");
    await expect(nearby.getByTestId("nearby-gps")).not.toContainText("Echo Clinic");               // inactive
    await expect(nearby.getByTestId("nearby-polyclinics").getByTestId("nearby-place").first()).toContainText("Bedok Polyclinic");
    await expect(nearby.getByTestId("nearby-hospitals").getByTestId("nearby-place")).toHaveCount(2);
    for (const line of await nearby.getByTestId("provenance-line").all()) await expect(line).toHaveText(AS_OF);
  });

  test("an area name works, and a postcode it can't place says how to recover", async ({ page }) => {
    await page.goto("/?near=bedok");
    await expect(page.getByTestId("nearby").getByRole("heading", { level: 2 })).toHaveText("Near Bedok");
    await expect(page.getByTestId("nearby-basis")).toContainText("approximate");

    await page.goto("/?near=4600");
    await expect(page.getByTestId("nearby-message")).toHaveText("Singapore postcodes have 6 digits. Check the number and try again.");
    await page.goto("/?near=990000");
    await expect(page.getByTestId("nearby-message")).toContainText("Try a nearby postcode");
  });

  test("the search works without JavaScript", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/");
    await page.getByLabel("Your postcode or area").fill("460001");
    await page.getByRole("button", { name: "Find clinics" }).click();
    await expect(page.getByTestId("nearby-gps").getByTestId("nearby-place").first()).toContainText("Alpha Clinic");
    await expect(page.getByTestId("status-card")).toHaveCount(3);
    await context.close();
  });

  test("the map loads when scrolled to, with every hospital and polyclinic", async ({ page }) => {
    await page.goto("/?near=460001");
    await expect(page.locator(".leaflet-container")).toHaveCount(0);                // not before it's needed
    await page.getByTestId("care-map").scrollIntoViewIfNeeded();
    await expect(page.locator(".leaflet-container")).toHaveCount(1);
    // 3 hospitals + 2 polyclinics + 4 nearest active GP clinics + the search point.
    await expect(page.locator("path.leaflet-interactive")).toHaveCount(3 + 2 + 4 + 1);
    await expect(page.getByTestId("map-key")).toContainText("Your search");
  });

  test("the weekday pattern and takeaways come from the API", async ({ page, request }) => {
    const body = await (await request.get("http://127.0.0.1:8791/api/v1/insights")).json() as
      { data: { insight_id: string; headline_rank: number | null; chart: { callout: string } | null }[] };
    const top = body.data.filter((i) => i.headline_rank != null && i.chart).sort((a, b) => a.headline_rank! - b.headline_rank!);
    await page.goto("/");
    await expect(page.getByTestId("week-pattern").getByTestId("heatmap")).toBeVisible();
    const items = page.getByTestId("takeaway");
    await expect(items).toHaveCount(Math.min(3, top.length));
    for (let i = 0; i < Math.min(3, top.length); i++) {
      await expect(items.nth(i)).toHaveAttribute("data-insight", top[i]!.insight_id);
      await expect(items.nth(i).getByTestId("takeaway-title")).toHaveText(top[i]!.chart!.callout);
    }
  });

  test("statistics are in a closed drawer that opens", async ({ page }) => {
    await page.goto("/");
    const drawer = page.getByTestId("methods-drawer");
    await expect(drawer).not.toHaveAttribute("open", "");
    await expect(page.getByText("Chance of this by luck (adjusted p)").first()).toBeHidden();
    await drawer.locator("summary").click();
    await expect(page.getByTestId("limits")).toBeVisible();
    await expect(drawer.getByText(/15% or more above usual is higher/)).toBeVisible();
  });

  test("works at this width with no sideways scrolling, and passes axe", async ({ page }) => {
    await page.goto("/?near=460001");
    await expectNoHorizontalScroll(page);
    await expectNoA11yViolations(page);
  });
});
