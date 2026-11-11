import { expect, type Page, test } from "@playwright/test";

import { blockTiles, expectNoA11yViolations, expectNoHorizontalScroll } from "./helpers";

/*
 * The home page's three views (lib/homeViews.ts), on the API's fixture snapshot:
 * SGH is +25% ("higher than usual"); AH and NUH have no usual level ("no comparison").
 * Both projects run this file: at 1280 px the control is a radio group, at 375 px a select.
 */
const AS_OF = /^Data as of \d{1,2} [A-Z][a-z]{2,3} \d{4} · Source: .+/;
const LABEL = { public: "Public", planner: "Planner summary", analyst: "Analyst detail" } as const;
type View = keyof typeof LABEL;

// Each section's test id, and the views it belongs to.
const SECTIONS: Record<string, View[]> = {
  "home-hero": ["public", "planner", "analyst"],
  "clinic-finder": ["public"],
  "summary-strip": ["planner", "analyst"],
  "status-grid": ["public", "planner", "analyst"],
  "map-section": ["public"],
  "takeaways": ["planner", "analyst"],
  "week-pattern": ["analyst"],
  "analyst-links": ["analyst"],
  "methods": ["public", "planner", "analyst"],
};

const narrow = (page: Page) => (page.viewportSize()?.width ?? 1280) < 640;

async function choose(page: Page, view: View) {
  if (narrow(page)) await page.getByTestId("view-select").selectOption(view);
  else await page.getByTestId("view-radios").getByText(LABEL[view], { exact: true }).click();
}

async function expectView(page: Page, view: View) {
  await expect(page.getByTestId("home")).toHaveAttribute("data-view", view);
  if (narrow(page)) await expect(page.getByTestId("view-select")).toHaveValue(view);
  else await expect(page.getByRole("radio", { name: LABEL[view], exact: true })).toBeChecked();
}

test.beforeEach(async ({ page }) => blockTiles(page));

test.describe("Home views", () => {
  test("the default is Public, and the control suits the width", async ({ page }) => {
    await page.goto("/");
    await expectView(page, "public");
    if (narrow(page)) {
      await expect(page.getByRole("combobox", { name: "View" })).toBeVisible();     // a labelled select
      await expect(page.getByTestId("view-radios")).toBeHidden();
      expect(await page.getByTestId("view-select").locator("option").allTextContents()).toEqual(Object.values(LABEL));
    } else {
      const group = page.getByRole("radiogroup", { name: "View" });
      await expect(group).toBeVisible();
      await expect(group.getByRole("radio")).toHaveCount(3);
      await expect(page.getByTestId("view-select")).toBeHidden();
    }
  });

  for (const view of Object.keys(LABEL) as View[]) {
    test(`${view}: renders its sections and no others`, async ({ page }) => {
      await page.goto(view === "public" ? "/" : `/?view=${view}`);
      await expectView(page, view);
      for (const [testId, views] of Object.entries(SECTIONS)) {
        await expect(page.getByTestId(testId), testId).toHaveCount(views.includes(view) ? 1 : 0);
      }
      // On every view: one page heading, the emergency line, "not medical advice", and a dated source on every block.
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(page.getByTestId("emergency-note")).toHaveText(/call 995/);
      await expect(page.getByTestId("not-advice")).toHaveText(/isn't medical advice/);
      const lines = page.getByTestId("home").getByTestId("provenance-line");
      expect(await lines.count()).toBeGreaterThan(0);
      for (const line of await lines.all()) await expect(line).toHaveText(AS_OF);
      // What MOH's figures cover stays on the cards, whatever the density.
      await expect(page.locator('[data-testid=status-card][data-hospital="AH"]').getByTestId("status-note")).toHaveText("Urgent care centre");
      await expect(page.locator('[data-testid=status-card][data-hospital="AH"]').getByTestId("status-live"))
        .toContainText(/To see a doctor: .+hospital's own estimate/);
    });
  }

  test("public cards are simple; planner and analyst cards add the line and the change", async ({ page }) => {
    await page.goto("/");
    const sgh = page.locator('[data-testid=status-card][data-hospital="SGH"]');
    await expect(page.getByTestId("status-grid")).toHaveAttribute("data-density", "simple");
    await expect(sgh.getByTestId("status-badge")).toHaveText("▲Higher than usual");
    await expect(sgh.getByTestId("sparkline")).toHaveCount(0);
    await expect(sgh.getByTestId("status-delta")).toHaveCount(0);

    for (const view of ["planner", "analyst"] as const) {
      await page.goto(`/?view=${view}`);
      await expect(page.getByTestId("status-grid")).toHaveAttribute("data-density", "full");
      await expect(sgh.getByTestId("status-badge")).toHaveText("▲Higher than usual");     // the same badge, the same figure
      await expect(sgh.getByTestId("status-hours")).toHaveText("5.0 h");
      await expect(sgh.getByTestId("status-delta")).toHaveText("+25% against usual");
      await expect(sgh.getByTestId("sparkline")).toBeAttached();
      // No usual level: no percentage, never a 0%.
      await expect(page.locator('[data-testid=status-card][data-hospital="AH"]').getByTestId("status-delta")).toHaveCount(0);
    }
  });

  test("the summary strip counts the badges on the cards", async ({ page }) => {
    await page.goto("/?view=planner");
    const strip = page.getByTestId("summary-strip");
    const counts = await strip.getByTestId("summary-count").evaluateAll((els) => els.map((e) =>
      [e.getAttribute("data-level"), e.querySelector('[data-testid="summary-number"]')!.textContent]));
    expect(counts).toEqual([["much_higher", "0"], ["higher", "1"], ["usual", "0"], ["lower", "0"], ["unknown", "2"]]);
    for (const [level, n] of counts) {
      await expect(page.locator(`[data-testid=status-card][data-level="${level}"]`)).toHaveCount(Number(n));
    }
    await expect(strip.getByTestId("provenance-line")).toHaveText(AS_OF);
  });

  test("analyst: the statistics are open, with links to Data Quality and Methodology", async ({ page }) => {
    await page.goto("/?view=analyst");
    const links = page.getByTestId("analyst-links");
    await expect(links.getByRole("link", { name: "Data Quality" })).toHaveAttribute("href", "/data-quality");
    await expect(links.getByRole("link", { name: "Methodology" })).toHaveAttribute("href", "/methodology");
    await expect(page.getByTestId("methods-drawer")).toHaveAttribute("open", "");
    await expect(page.getByTestId("limits")).toBeVisible();
    const shown = await page.getByTestId("takeaway").count();
    await expect(page.getByTestId("methods-findings").locator("> li")).toHaveCount(shown);
    if (shown) await expect(page.getByText("Chance of this by luck (adjusted p)").first()).toBeVisible();

    // Planner and public keep the definitions, closed, without the statistics.
    for (const url of ["/?view=planner", "/"]) {
      await page.goto(url);
      await expect(page.getByTestId("methods-drawer")).not.toHaveAttribute("open", "");
      await expect(page.getByTestId("methods-findings")).toHaveCount(0);
    }
  });

  test("the view is in the URL: it survives a reload, and back and forward", async ({ page }) => {
    await page.goto("/");
    await choose(page, "planner");
    await expect(page).toHaveURL(/\/\?view=planner$/);
    await expectView(page, "planner");
    await choose(page, "analyst");
    await expect(page).toHaveURL(/\/\?view=analyst$/);
    await expectView(page, "analyst");

    await page.reload();
    await expectView(page, "analyst");
    await page.goBack();
    await expect(page).toHaveURL(/\/\?view=planner$/);
    await expectView(page, "planner");
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expectView(page, "public");
    await page.goForward();
    await expectView(page, "planner");

    await choose(page, "public");
    await expect(page).toHaveURL(/\/$/);                                  // Public is the plain address
    await expectView(page, "public");
  });

  test("a shared link opens its view, and an unknown view is Public", async ({ page }) => {
    await page.goto("/?view=analyst");
    await expectView(page, "analyst");
    for (const bad of ["bogus", "", "PLANNER", "x&view=analyst"]) {          // repeated: the first value counts
      await page.goto(`/?view=${bad}`);
      await expectView(page, "public");
      await expect(page.getByTestId("clinic-finder")).toHaveCount(1);
    }
    await page.goto("/?view=public");                                     // spelled out is fine too
    await expectView(page, "public");
  });

  test("changing the view keeps the search", async ({ page }) => {
    await page.goto("/?near=460001");
    await expect(page.getByTestId("nearby")).toBeVisible();
    await choose(page, "planner");
    await expect(page).toHaveURL(/\/\?near=460001&view=planner$/);
    await expect(page.getByTestId("nearby")).toHaveCount(0);              // the planner view has no clinic finder
    await choose(page, "public");
    await expect(page).toHaveURL(/\/\?near=460001$/);
    await expect(page.getByTestId("nearby")).toBeVisible();
  });

  test("keyboard: Tab reaches the group once, arrow keys move the choice, focus is visible", async ({ page }) => {
    test.skip(narrow(page), "the radio group is the wide layout; a select is used at 375 px");
    await page.goto("/");
    let onRadio = false;
    for (let i = 0; i < 10 && !onRadio; i++) {
      await page.keyboard.press("Tab");
      onRadio = await page.evaluate(() => document.activeElement?.matches('input[type="radio"][name="view"]') ?? false);
    }
    expect(onRadio, "Tab reaches the radio group").toBe(true);
    await expect(page.getByRole("radio", { name: "Public", exact: true })).toBeFocused();
    const outline = await page.evaluate(() => {
      const s = getComputedStyle(document.activeElement!.closest("label")!);
      return { style: s.outlineStyle, width: s.outlineWidth };
    });
    expect(outline).toEqual({ style: "solid", width: "3px" });

    await page.keyboard.press("ArrowRight");
    await expect(page).toHaveURL(/\?view=planner$/);
    await expectView(page, "planner");
    await expect(page.getByRole("radio", { name: "Planner summary" })).toBeFocused();   // focus stays in the group
    await page.keyboard.press("ArrowRight");
    await expectView(page, "analyst");
    await page.keyboard.press("ArrowLeft");
    await expect(page).toHaveURL(/\?view=planner$/);
    await expectView(page, "planner");
    await expect(page.getByRole("radio", { name: "Planner summary" })).toBeFocused();

    // One Tab leaves the group: it is a single stop, not three.
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement?.matches('input[name="view"]'))).toBe(false);
  });

  test("works without JavaScript: the link, and the control as a form", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    const wide = (page.viewportSize()?.width ?? 1280) >= 640;
    await page.goto("/?view=planner");
    await expect(page.getByTestId("summary-strip")).toHaveCount(1);
    await expect(page.getByTestId("status-card")).toHaveCount(3);
    if (wide) await page.getByTestId("view-radios").getByText("Analyst detail", { exact: true }).click();
    else await page.getByTestId("view-select").selectOption("analyst");
    await page.getByRole("button", { name: "Change view" }).click();
    await expect(page).toHaveURL(/\?view=analyst$/);
    await expect(page.getByTestId("week-pattern")).toHaveCount(1);
    await context.close();
  });

  test("the control is only on the home page, however the page is reached", async ({ page }) => {
    await page.goto("/findings");
    await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
    await expect(page.getByTestId("view-switch")).toHaveCount(0);

    // Following links, without a full page load: it goes when leaving the home page and returns with it.
    await page.goto("/?view=planner");
    await expect(page.getByTestId("view-switch")).toHaveCount(1);
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Methodology" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Methodology" })).toBeVisible();
    await expect(page.getByTestId("view-switch")).toHaveCount(0);
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Home" }).click();
    await expectView(page, "public");
    await expect(page.getByTestId("view-switch")).toHaveCount(1);
  });

  for (const view of Object.keys(LABEL) as View[]) {
    test(`${view}: no sideways scrolling, and passes axe (WCAG 2.2 AA)`, async ({ page }) => {
      await page.goto(`/?view=${view}`);
      await expectView(page, view);
      await expectNoHorizontalScroll(page);
      await expectNoA11yViolations(page, { wcag22: true });
    });

    test(`${view}: fits a 768 px tablet`, async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.goto(`/?view=${view}`);
      await expect(page.getByRole("radiogroup", { name: "View" })).toBeVisible();
      await expectNoHorizontalScroll(page);
      await expectNoA11yViolations(page, { wcag22: true });
    });
  }
});
