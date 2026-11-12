import { expect, type Page, test } from "@playwright/test";

import { blockTiles, expectNoA11yViolations, expectNoHorizontalScroll } from "./helpers";

/*
 * The hospital map's controls on the API's fixture snapshot (api/tests/fixture_snapshot.py):
 * SGH is SingHealth; AH and NUH are NUHS. SGH is +25% (higher), AH has no comparison, NUH has no figure.
 * State lives in the address: ?cluster= &layout= &hospital= &sort=.
 */

test.beforeEach(async ({ page }) => blockTiles(page));

const drawer = (page: Page) => page.getByTestId("hospital-drawer");
const rowCodes = (page: Page) => page.getByTestId("care-row").evaluateAll((els) => els.map((e) => e.getAttribute("data-hospital")));
const markerCodes = async (page: Page) => {
  await page.getByTestId("care-map").scrollIntoViewIfNeeded();
  await expect(page.locator(".leaflet-container")).toHaveCount(1);
  return page.locator("path[data-hospital-trigger]").evaluateAll((els) => els.map((e) => e.getAttribute("data-hospital-trigger")).sort());
};
/** The controls answer only once React has attached to them: a click before that does nothing. */
const hydrated = (page: Page) => page.waitForFunction(() => {
  const el = document.querySelector('[data-testid="layout-toggle"] button');
  return !!el && Object.keys(el).some((k) => k.startsWith("__reactProps"));
});
/** axe reads colours; a drawer still fading in would be read half transparent. */
const settled = (page: Page) => drawer(page).evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)).then(() => true));
const inDrawer = (page: Page) => page.evaluate(() => !!document.activeElement?.closest('[data-testid="hospital-drawer"]'));

test.describe("Map controls", () => {
  test("a shared link restores the filter, layout, sort and open hospital, also after a reload", async ({ page }) => {
    await page.goto("/?cluster=NUHS&layout=list&sort=name&hospital=AH");
    await hydrated(page);
    const check = async () => {
      await expect(page.getByTestId("care-panel")).toHaveAttribute("data-cluster", "NUHS");
      await expect(page.getByTestId("care-panel")).toHaveAttribute("data-layout", "list");
      await expect(page.locator('[data-testid="cluster-chip"][data-cluster="NUHS"]')).toHaveAttribute("aria-pressed", "true");
      expect(await rowCodes(page)).toEqual(["AH", "NUH"]);
      await expect(drawer(page)).toBeVisible();
      await expect(drawer(page).getByRole("heading", { level: 2 })).toContainText("Alexandra Hospital");
      await expect(page.getByTestId("care-list-view")).toBeVisible();
      await expect(page.getByTestId("care-map-view")).toBeHidden();
    };
    await check();
    await page.reload();
    await check();
  });

  test("a changed filter, layout and order are in the address and survive a reload", async ({ page }) => {
    await page.goto("/");
    await hydrated(page);
    await page.getByTestId("cluster-chip").filter({ hasText: "NUHS" }).click();
    await page.getByTestId("layout-toggle").getByRole("button", { name: /List/ }).click();
    await page.locator('[data-sort="hours"]').click();
    await expect(page).toHaveURL(/cluster=NUHS/);
    await expect(page).toHaveURL(/layout=list/);
    await expect(page).toHaveURL(/sort=hours/);
    await page.reload();
    await hydrated(page);
    expect(await rowCodes(page)).toEqual(["AH", "NUH"]);                    // longest first, no figure last
    await expect(page.locator('th[aria-sort="descending"]')).toContainText("Wait for a ward bed");
    await page.getByTestId("cluster-chip").filter({ hasText: "All" }).click();
    await expect(page).not.toHaveURL(/cluster=/);
  });

  test("values the page doesn't know are ignored", async ({ page }) => {
    await page.goto("/?cluster=Nope&layout=grid&hospital=ZZZ&sort=zzz");
    await hydrated(page);
    await expect(page.getByTestId("care-panel")).toHaveAttribute("data-cluster", "all");
    await expect(drawer(page)).toBeHidden();
    await expect(page.getByTestId("care-count")).toContainText("Showing 3 of 3 hospitals");
  });

  test("the default layout is the list on a phone and the map from 640px; ?layout= wins", async ({ page }, info) => {
    const phone = info.project.name === "mobile-375";
    await page.goto("/");
    await hydrated(page);
    await expect(page.getByTestId("care-list-view")).toBeVisible({ visible: phone });
    await expect(page.getByTestId("care-map-view")).toBeVisible({ visible: !phone });
    await expect(page.getByTestId("layout-toggle").getByRole("button", { pressed: true })).toHaveText(new RegExp(phone ? "List" : "Map"));
    await page.goto(phone ? "/?layout=map" : "/?layout=list");
    await hydrated(page);
    await expect(page.getByTestId("care-list-view")).toBeVisible({ visible: !phone });
    await expect(page.getByTestId("care-map-view")).toBeVisible({ visible: phone });
  });

  test("filter and layout together: the map's markers and the list show the same hospitals", async ({ page }) => {
    for (const [cluster, expected] of [["SingHealth", ["SGH"]], ["NUHS", ["AH", "NUH"]], ["All", ["AH", "NUH", "SGH"]]] as const) {
      await page.goto("/?layout=list");
      await hydrated(page);
      await page.getByTestId("cluster-chip").filter({ hasText: cluster }).click();
      await expect.poll(async () => (await rowCodes(page)).sort()).toEqual(expected);
      await page.getByTestId("layout-toggle").getByRole("button", { name: /Map/ }).click();
      await expect(page.getByTestId("care-map-view")).toBeVisible();
      await expect.poll(() => markerCodes(page)).toEqual(expected);
      await expect(page.getByTestId("care-count")).toContainText(`Showing ${expected.length} of 3`);
    }
  });
});

test.describe("The details drawer", () => {
  test("from the list: focus moves in, Tab stays inside, Esc closes and focus returns to the row's button", async ({ page }) => {
    await page.goto("/?layout=list");
    await hydrated(page);
    const trigger = page.locator('[data-hospital-trigger="SGH"]');
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(drawer(page)).toBeVisible();
    await expect(page).toHaveURL(/hospital=SGH/);
    expect(await inDrawer(page)).toBe(true);
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      expect(await inDrawer(page)).toBe(true);
    }
    await page.keyboard.press("Shift+Tab");
    expect(await inDrawer(page)).toBe(true);
    await page.keyboard.press("Escape");
    await expect(drawer(page)).toBeHidden();
    await expect(page).not.toHaveURL(/hospital=/);
    await expect(trigger).toBeFocused();
  });

  test("from the map: Enter on a marker opens it, Esc closes it and focus returns to that marker", async ({ page }) => {
    await page.goto("/?layout=map");
    await hydrated(page);
    expect(await markerCodes(page)).toEqual(["AH", "NUH", "SGH"]);
    const marker = page.locator('path[data-hospital-trigger="SGH"]');
    await expect(marker).toHaveAttribute("role", "button");
    await expect(marker).toHaveAttribute("aria-label", /Singapore General Hospital: Higher than usual/);
    await marker.focus();
    await page.keyboard.press("Enter");
    await expect(drawer(page)).toBeVisible();
    await expect(page).toHaveURL(/hospital=SGH/);
    expect(await inDrawer(page)).toBe(true);
    await page.keyboard.press("Escape");
    await expect(drawer(page)).toBeHidden();
    await expect(marker).toBeFocused();
  });

  test("the map's tab stops are the hospital markers only, each named with its status", async ({ page }) => {
    await page.goto("/?layout=map#near=460001");
    await hydrated(page);
    expect(await markerCodes(page)).toEqual(["AH", "NUH", "SGH"]);
    // Polyclinic, GP and search dots are decorative: out of the tab order and hidden from assistive technology.
    const dots = page.locator("path.leaflet-interactive:not([data-hospital-trigger])");
    expect(await dots.count()).toBeGreaterThan(0);
    for (const dot of await dots.all()) {
      await expect(dot).toHaveAttribute("tabindex", "-1");
      await expect(dot).toHaveAttribute("aria-hidden", "true");
    }
    // The svg is a group, not an image (an image's children can be flattened by a screen reader).
    await expect(page.locator(".leaflet-overlay-pane svg")).toHaveAttribute("role", "group");
    // Tab from the layout toggle: the map box, then each hospital marker by name, and no nameless stop.
    await page.getByTestId("layout-toggle").getByRole("button", { name: /List/ }).focus();
    const names: string[] = [];
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("Tab");
      names.push(await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? ""));
    }
    expect(names[0]).toMatch(/^Map\./);
    expect(names.slice(1, 4).map((n) => n.replace(/:.*/, "")).sort()).toEqual(
      ["Alexandra Hospital (UCC)", "National University Hospital", "Singapore General Hospital"]);
    expect(names.slice(0, 4).every(Boolean)).toBe(true);
  });

  test("a click opens it too, Close closes it, and Back closes it", async ({ page }) => {
    await page.goto("/?layout=map");
    await hydrated(page);
    await markerCodes(page);
    await page.locator('path[data-hospital-trigger="AH"]').click();
    await expect(drawer(page)).toBeVisible();
    await page.getByTestId("drawer-close").click();
    await expect(drawer(page)).toBeHidden();
    await expect(page).not.toHaveURL(/hospital=/);
    await page.locator('path[data-hospital-trigger="AH"]').click();
    await expect(drawer(page)).toBeVisible();
    await page.goBack();
    await expect(drawer(page)).toBeHidden();
    await expect(page).not.toHaveURL(/hospital=/);
    await page.waitForTimeout(300);                                       // Next's router finishes handling Back before Forward
    await page.goForward();
    await expect(drawer(page)).toBeVisible();
  });

  test("it shows the status, the labelled bed wait against usual, the line, the caveats and the trend link", async ({ page }) => {
    await page.goto("/?layout=list&hospital=SGH");
    await hydrated(page);
    const body = page.getByTestId("drawer-body");
    await expect(body.getByTestId("status-badge")).toContainText("Busier than usual for this hospital");
    await expect(body).toContainText("Time waiting for a ward bed after the decision to admit");
    await expect(body.getByTestId("drawer-hours")).toHaveText("5.0 h");
    await expect(body.getByTestId("drawer-usual")).toContainText("Usual: 4.0 h");
    await expect(body.getByTestId("sparkline")).toBeVisible();
    await expect(body.getByTestId("provenance-line")).toContainText("Data as of");
    await expect(body.getByTestId("provenance-line")).toContainText("Source:");
    await expect(body.getByTestId("drawer-trend")).toHaveAttribute("href", "/ed-trends?hospital=SGH");
    await expect(body.getByTestId("drawer-live")).toHaveCount(0);                 // no NUHS estimate for SGH: nothing is shown
    await page.goto("/?layout=list&hospital=AH");
    await hydrated(page);
    await expect(page.getByTestId("drawer-coverage")).toContainText("Urgent care centre");
    await expect(page.getByTestId("status-badge").last()).toContainText("No comparison");
  });

  test("opening it moves nothing on the page and adds no sideways scroll", async ({ page }) => {
    await page.goto("/?layout=list");
    await hydrated(page);
    const before = await page.evaluate(() => ({ h: document.documentElement.scrollHeight, w: document.documentElement.scrollWidth,
      top: document.getElementById("map-heading")!.getBoundingClientRect().top + window.scrollY }));
    await page.locator('[data-hospital-trigger="SGH"]').click();
    await expect(drawer(page)).toBeVisible();
    const after = await page.evaluate(() => ({ h: document.documentElement.scrollHeight, w: document.documentElement.scrollWidth,
      top: document.getElementById("map-heading")!.getBoundingClientRect().top + window.scrollY }));
    expect(after).toEqual(before);
    await expectNoHorizontalScroll(page);
  });

  test("the slide-in is off with reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/?layout=list&hospital=SGH");
    await hydrated(page);
    await expect(drawer(page)).toBeVisible();
    expect(await drawer(page).evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/?layout=list");
    await hydrated(page);
    await page.locator('[data-hospital-trigger="SGH"]').click();
    await expect(drawer(page)).toBeVisible();
    expect(await drawer(page).evaluate((el) => getComputedStyle(el).animationName)).toMatch(/care-(drawer|sheet)-in/);
  });
});

test.describe("Accessibility and size", () => {
  for (const layout of ["map", "list"] as const) {
    test(`axe finds nothing on the ${layout} layout, with no sideways scroll`, async ({ page }) => {
      await page.goto(`/?layout=${layout}`);
      await hydrated(page);
      if (layout === "map") await markerCodes(page);
      await expectNoA11yViolations(page, { wcag22: true });
      await expectNoHorizontalScroll(page);
    });
  }

  test("the list's table fits its box: nothing is cut off at either width", async ({ page }) => {
    await page.goto("/?layout=list");
    await hydrated(page);
    const box = page.getByTestId("care-list");
    expect(await box.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await expect(page.getByTestId("care-row").first().getByTestId("status-badge")).toBeVisible();
  });

  test("axe finds nothing with the drawer open, and each page says it isn't medical advice", async ({ page }) => {
    await page.goto("/?layout=list&hospital=NUH");
    await hydrated(page);
    await expect(drawer(page)).toBeVisible();
    await expect(page.getByTestId("drawer-live")).toContainText(/To see a doctor .*estimate/);
    await settled(page);
    await expectNoA11yViolations(page, { wcag22: true });
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("not-advice")).toContainText("isn't medical advice");
    await expect(page.getByTestId("emergency-note")).toContainText("995");
  });
});
