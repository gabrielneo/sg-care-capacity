import { expect, test } from "@playwright/test";

import { blockTiles, expectNoA11yViolations, expectNoHorizontalScroll, settleMotion } from "./helpers";

/*
 * The landing page ("/", 16 Nov 2026): a short claim, two pictures each with one short note, and three ways on. The clinic
 * finder and the Planner and Analyst views moved to /find. The fixture snapshot has 3 hospitals and 2 planning areas.
 */

const API = "http://127.0.0.1:8791/api/v1";

test.beforeEach(async ({ page }) => blockTiles(page));

test.describe("Landing", () => {
  test("opens with one heading, two ways on, and no red 995 banner", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Hospital bed waits in Singapore, and clinic access for seniors/);
    await expect(page.getByTestId("cta-find")).toHaveAttribute("href", "/find");
    await expect(page.getByTestId("cta-findings")).toHaveAttribute("href", "/findings");
    await expect(page.getByTestId("emergency-note")).toHaveCount(0);
    await expect(page.getByTestId("footer-notice").getByRole("link", { name: "Call 995" })).toHaveAttribute("href", "tel:995");
    await expect(page.getByTestId("landing-hero").getByTestId("not-advice")).toContainText("isn't medical advice");
  });

  test("the hero states the engine's top finding word for word, and its chart has a scale and both end values", async ({ page, request }) => {
    const all = await (await request.get(`${API}/insights`)).json() as { data: { headline: string; headline_rank: number | null }[] };
    const top = all.data.filter((i) => i.headline_rank != null && i.headline).sort((a, b) => a.headline_rank! - b.headline_rank!)[0];
    await page.goto("/");
    if (top) await expect(page.getByTestId("hero-claim")).toHaveText(`Top finding: ${top.headline}`);
    else await expect(page.getByTestId("hero-claim")).toHaveCount(0);
    const ticks = page.getByTestId("hero-ticks").locator("span");
    await expect(ticks.first()).toHaveText("0");
    await expect(ticks.last()).toHaveText(/ h$/);
    await expect(page.getByTestId("hero-range").locator("span").first()).toHaveText(/: \d+\.\d hours$/);
  });

  test("the first screen has the claim and both buttons", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("cta-find")).toBeInViewport({ ratio: 1 });
    await expect(page.getByTestId("cta-findings")).toBeInViewport({ ratio: 1 });
  });

  test("the bed-wait picture has a short note from the data, its own date and source, and exports", async ({ page }) => {
    await page.goto("/");
    const section = page.getByTestId("landing-waits");
    await expect(section.getByRole("heading", { level: 2 })).toHaveText(/Bed waits, against each hospital's usual/);
    await expect(section.getByTestId("landing-count")).toHaveText(/^\d+ of \d+ emergency departments? above usual, week of .+\.$/);
    await expect(section.getByTestId("dumbbell-row").first()).toBeVisible();
    await expect(section.getByTestId("provenance-line")).toHaveText(/^Data as of \d{1,2} [A-Z][a-z]{2} \d{4} · Source: /);
    await expect(section.getByTestId("csv-download")).toHaveAttribute("href", /\/export\/ed-weekly\.csv/);
    await expect(section.getByTestId("chart-table")).toHaveCount(1);
  });

  test("the access picture is plain SVG, one shape per area, with a legend, a table link and no map script", async ({ page }) => {
    await page.goto("/");
    const section = page.getByTestId("landing-access");
    await expect(section.getByTestId("landing-access-count")).toHaveText(/^\d+ of \d+ planning areas are ranked\.$/);
    const shapes = section.locator("svg[role=img] path");
    expect(await shapes.count()).toBeGreaterThan(0);
    // Every area is named in its tooltip (a <title> with more than one child is rendered empty by React 19), and the page hydrates cleanly.
    const names = await section.locator("svg[role=img] path title").allTextContents();
    expect(names.length).toBe(await shapes.count());
    for (const n of names) expect(n.trim().length).toBeGreaterThan(0);
    await expect(section.getByTestId("landing-legend")).toContainText("Darker means fewer");
    await expect(section.getByTestId("chart-table-link")).toHaveAttribute("href", "/access-map?view=table");
    await expect(section.getByTestId("provenance-line")).toHaveText(/^Data as of /);
    await expect(page.locator(".leaflet-container")).toHaveCount(0);
  });

  test("three ways on, each a title link only (the sentence is plain text)", async ({ page }) => {
    await page.goto("/");
    const cards = page.getByTestId("landing-card");
    await expect(cards).toHaveCount(3);
    for (const card of await cards.all()) {
      await expect(card.getByRole("link")).toHaveCount(1);
      expect(await card.getByRole("link").evaluate((a) => getComputedStyle(a).textDecorationLine)).toContain("underline");
      expect(await card.locator("p").evaluate((p) => getComputedStyle(p).textDecorationLine)).toBe("none");
    }
  });

  test("works without JavaScript: both pictures are in the page", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.getByTestId("dumbbell-row").first()).toBeVisible();
    await expect(page.locator("[data-testid=landing-access] svg[role=img]")).toBeVisible();
    await context.close();
  });

  for (const width of [375, 768, 1280, 1440]) {
    test(`no sideways scrolling at ${width}px, and passes axe (WCAG 2.2 AA)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await expect(page).toHaveTitle(/\S/);       // Next streams a dynamic page's <title>; axe must not look before it is in the head
      await expectNoHorizontalScroll(page);
      await settleMotion(page);
      await expectNoA11yViolations(page, { wcag22: true });
    });
  }

  test("with reduced motion nothing animates, nothing is hidden, and axe passes at once", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await expect(page).toHaveTitle(/\S/);
    expect(await page.evaluate(() => document.querySelectorAll('[data-reveal="armed"]').length)).toBe(0);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    await expect(page.getByTestId("landing-stat").first()).toBeVisible();
    await expectNoA11yViolations(page, { wcag22: true });
  });

  test("blocks below the first screen rise in as they arrive, and are all shown once reached", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 700 });
    await page.goto("/");
    await expect(page).toHaveTitle(/\S/);
    // Hidden only after the page has loaded in the browser, and only what starts below the fold: the hero is never hidden.
    await expect(page.getByTestId("landing-hero")).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.querySelectorAll('[data-reveal="armed"]').length)).toBeGreaterThan(0);
    await settleMotion(page);
    expect(await page.evaluate(() => document.querySelectorAll('[data-reveal="armed"]').length)).toBe(0);
    await expect(page.getByTestId("landing-waits")).toBeVisible();
  });

  test("the hero line and the three figures are drawn from the data, each with its date and source", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("hero-line")).toHaveAttribute("aria-label", /average bed wait.*hours/);
    await expect(page.getByTestId("hero-source")).toHaveText(/^Data as of \d{1,2} [A-Z][a-z]{2} \d{4} · Source: /);
    await settleMotion(page);
    for (const stat of await page.getByTestId("landing-stat").all()) await expect(stat).toContainText(/\d/);
  });

  test("Home is the current page here, and Explore is current on the finder", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await expect(page.getByTestId("nav-bar").getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
    await page.goto("/find");
    await expect(page.getByTestId("nav-bar").getByRole("link", { name: "Explore" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("nav-bar").getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current", "page");
  });
});

test.describe("Old home addresses", () => {
  test("the finder's parameters are sent to /find, and nothing else is carried", async ({ page }) => {
    // The Planner and Analyst views were removed on 18 Nov 2026: their ?view= is dropped, the map's own ?sort= is kept.
    await page.goto("/?view=planner&sort=hours&utm=x");
    await expect(page).toHaveURL(/\/find\?sort=hours$/);
    await expect(page.getByTestId("home")).toHaveAttribute("data-view", "public");
  });

  test("a plain address stays on the landing page", async ({ page }) => {
    await page.goto("/?utm=x");
    await expect(page).toHaveURL(/\/\?utm=x$/);
    await expect(page.getByTestId("landing")).toBeVisible();
  });

  test("the finder is at /find, with the postcode box", async ({ page }) => {
    await page.goto("/find");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Find a clinic near you");
    await expect(page.getByLabel("Your postcode or area")).toBeVisible();
  });
});
