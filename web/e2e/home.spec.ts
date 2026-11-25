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
  test("the first screen leads with the heading, then the search, with no red 995 banner", async ({ page }) => {
    await page.goto("/find");
    // The banner was removed (16 Nov 2026): the heading is the first thing in the hero. The number stays in the footer.
    await expect(page.getByTestId("emergency-note")).toHaveCount(0);
    const firstInHero = await page.getByTestId("home-hero").evaluate((el) => el.firstElementChild?.tagName);
    expect(firstInHero).toBe("H1");
    await expect(page.getByTestId("footer-notice").getByRole("link", { name: "Call 995" })).toHaveAttribute("href", "tel:995");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Find a clinic near you");
    // Wholly in view, with the machine's fonts: a half-visible box would pass `toBeInViewport()` and fail on CI's wider fonts.
    await expect(page.getByLabel("Your postcode or area")).toBeInViewport({ ratio: 1 });
    await expect(page.getByTestId("nearby")).toHaveCount(0);                     // nothing until a search
    await expect(page.getByTestId("ed-item")).toHaveCount(0);                    // and no hospital is ranked before one
    await expect(page.getByTestId("status-card")).toHaveCount(0);
  });

  test("with a wider font, as Linux's fallback font is, the search is still on the first screen", async ({ page }) => {
    // CI's Chromium falls back to a wider font than macOS: the site title wrapped there and pushed the search below the fold.
    await page.addInitScript(() => document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = "html, body, * { font-family: Verdana, 'DejaVu Sans', sans-serif !important; }";
      document.head.append(style);
    }));
    await page.goto("/find");
    await expect(page.getByRole("heading", { level: 1 })).toBeInViewport();
    await expect(page.getByLabel("Your postcode or area")).toBeInViewport({ ratio: 1 });
  });

  test("it says it isn't medical advice, and that a search stays in the browser", async ({ page }) => {
    await page.goto("/find");
    await expect(page.getByTestId("not-advice")).toHaveText(/isn't medical advice/);
    await expect(page.getByTestId("search-privacy")).toHaveText(/stays in this browser/);
    await page.goto("/find#near=460002");
    await expect(page.getByTestId("nearby-basis")).toContainText("the newest list data.gov.sg publishes");
  });

  test("a shared link gets a preview image and the new description", async ({ page, request }) => {
    await page.goto("/find");
    const image = await page.locator('meta[property="og:image"]').getAttribute("content");
    expect(image).toMatch(/\/opengraph-image/);
    const res = await request.get(new URL(image!).pathname + new URL(image!).search);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/png");
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /analytics project by Gabriel Neo.*does not test a link between them/);
  });

  test("without JavaScript the 995 number is still in the footer, and the finder says it needs JavaScript", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/find");
    await expect(page.getByTestId("footer-notice")).toContainText("Call 995");
    await expect(page.getByTestId("not-advice")).toHaveText(/isn't medical advice/);
    await expect(page.getByTestId("needs-js")).toContainText("needs JavaScript");
    await context.close();
  });

  test("the map loads when scrolled to, with every hospital and polyclinic", async ({ page }) => {
    // ?layout=map: below 640px the default layout is the list, which has no map to load.
    await page.goto("/find?layout=map#near=460001");
    await expect(page.locator(".leaflet-container")).toHaveCount(0);                // not before it's needed
    await page.getByTestId("care-map").scrollIntoViewIfNeeded();
    await expect(page.locator(".leaflet-container")).toHaveCount(1);
    // 3 hospitals + 2 polyclinics + 4 nearest active GP clinics + the search point.
    await expect(page.locator("path.leaflet-interactive")).toHaveCount(3 + 2 + 4 + 1);
    await expect(page.getByTestId("map-key")).toContainText("Your search");
  });

  test("definitions and limits are in a closed drawer that opens", async ({ page }) => {
    await page.goto("/find");
    const drawer = page.getByTestId("methods-drawer");
    await expect(drawer).not.toHaveAttribute("open", "");
    await expect(page.getByText("Chance of this by luck (adjusted p)").first()).toBeHidden();
    await drawer.locator("summary").click();
    await expect(page.getByTestId("limits")).toBeVisible();
    await expect(drawer.getByText(/15% or more above usual is higher/)).toBeVisible();
  });

  test("works at this width with no sideways scrolling, and passes axe", async ({ page }) => {
    await page.goto("/find#near=460001");
    await expect(page.getByTestId("nearby-place").first()).toBeVisible();
    await expect(page.getByTestId("ed-item")).toHaveCount(3);
    await expectNoHorizontalScroll(page);
    await expectNoA11yViolations(page, { wcag22: true });
  });
});
