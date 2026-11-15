import { expect, type Page, test } from "@playwright/test";

import { blockTiles, expectNoA11yViolations, expectNoHorizontalScroll } from "./helpers";

/*
 * The home page's three views (lib/homeViews.ts), on the API's fixture snapshot:
 * SGH is +25% ("higher than usual"); AH and NUH have no usual level ("no comparison").
 * Both projects run this file: from 768 px the control is a segmented radio group in the header; below it, a radio group in the menu sheet.
 */
const AS_OF = /^Data as of \d{1,2} [A-Z][a-z]{2,3} \d{4} · Source: .+/;
const LABEL = { public: "Public", planner: "Planner", analyst: "Analyst" } as const;
type View = keyof typeof LABEL;

// Each section's test id, and the views it belongs to.
const SECTIONS: Record<string, View[]> = {
  "home-hero": ["public", "planner", "analyst"],
  "clinic-finder": ["public"],
  "summary-strip": ["planner", "analyst"],
  "what-changed": ["planner", "analyst"],
  "ed-near": ["public"],
  "status-grid": ["planner", "analyst"],
  "map-section": ["public"],
  "takeaways": ["planner", "analyst"],
  "week-pattern": ["analyst"],
  "analyst-links": ["public", "planner", "analyst"],
  "methods": ["public", "planner", "analyst"],
};

const narrow = (page: Page) => (page.viewportSize()?.width ?? 1280) < 768;

async function choose(page: Page, view: View) {
  if (narrow(page)) {
    await page.getByTestId("menu-button").click();
    await page.getByTestId("view-radios-sheet").getByText(LABEL[view], { exact: true }).click();   // picking a view closes the sheet
    await expect(page.getByTestId("menu-sheet")).toBeHidden();
  } else await page.getByTestId("view-radios").getByText(LABEL[view], { exact: true }).click();
}

async function expectView(page: Page, view: View) {
  await expect(page.getByTestId("home")).toHaveAttribute("data-view", view);
  if (narrow(page)) {
    await page.getByTestId("menu-button").click();
    await expect(page.getByTestId("view-radios-sheet").getByRole("radio", { name: LABEL[view], exact: true })).toBeChecked();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("menu-sheet")).toBeHidden();
  } else await expect(page.getByRole("radio", { name: LABEL[view], exact: true })).toBeChecked();
}

/** Follow a section's link: in the header's nav from 768 px, in the menu sheet below it. */
async function goNav(page: Page, label: string) {
  if (narrow(page)) {
    await page.getByTestId("menu-button").click();
    await page.getByTestId("nav-sheet").getByRole("link", { name: new RegExp(`^${label}`) }).click();
    await expect(page.getByTestId("menu-sheet")).toBeHidden();   // following a link closes the sheet
  } else await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: label, exact: true }).click();
}

test.beforeEach(async ({ page }) => blockTiles(page));

test.describe("Home views", () => {
  test("the default is Public, and the control suits the width", async ({ page }) => {
    await page.goto("/");
    await expectView(page, "public");
    if (narrow(page)) {
      // Below 768 px the choice lives in the menu sheet, not in the header.
      await expect(page.getByTestId("view-radios")).toBeHidden();
      await page.getByTestId("menu-button").click();
      const group = page.getByTestId("view-radios-sheet");
      await expect(group).toBeVisible();
      expect((await group.locator("label").allInnerTexts()).map((t) => t.replace("✓", "").trim())).toEqual(Object.values(LABEL));
    } else {
      const group = page.getByRole("radiogroup", { name: "View" });
      await expect(group).toBeVisible();
      await expect(group.getByRole("radio")).toHaveCount(3);
      expect((await group.boundingBox())!.height).toBeCloseTo(36, 0);          // the 36px segmented control
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
      await expect(page.getByTestId("emergency-note")).toHaveText(/call 995/i);
      // Public: the full card says it in two sentences. Planner and Analyst: one compact line, with the same words as the footer.
      if (view === "public") await expect(page.getByTestId("not-advice")).toHaveText(/isn't medical advice/);
      else await expect(page.getByTestId("emergency-note")).toHaveText("✚ Emergency? Call 995. This site shows public statistics, not medical advice.");
      const lines = page.getByTestId("home").getByTestId("provenance-line");
      // Public shows no figure until a search (then each block is dated: e2e/finder.spec.ts); the other views always do.
      for (const line of await lines.all()) await expect(line).toHaveText(AS_OF);
      // Planner and Analyst: every data section's header states its window, source and date once (components/SectionHeader.tsx).
      const metas = page.getByTestId("home").getByTestId("section-meta");
      if (view !== "public") expect(await metas.count()).toBeGreaterThan(2);
      for (const line of await metas.all()) await expect(line).toContainText(/Source: .+ · Data as of \d{1,2} [A-Z][a-z]{2,3} \d{4}/);
      // What MOH's figures cover stays on the cards (Planner and Analyst); Public shows the nearest three after a search.
      if (view !== "public") {
        await expect(page.locator('[data-testid=status-card][data-hospital="AH"]').getByTestId("status-note")).toHaveText("Urgent care centre");
        await expect(page.locator('[data-testid=status-card][data-hospital="AH"]').getByTestId("status-live"))
          .toContainText(/To see a doctor: .+ estimate, .+\. Published separately by NUHS, so newer than the weekly data\./);
      }
    });
  }

  test("public has no list of every hospital; planner and analyst have the full cards with the line and the change", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("status-grid")).toHaveCount(0);
    await expect(page.getByTestId("status-card")).toHaveCount(0);
    const sgh = page.locator('[data-testid=status-card][data-hospital="SGH"]');
    for (const view of ["planner", "analyst"] as const) {
      await page.goto(`/?view=${view}`);
      await expect(page.getByTestId("status-grid")).toHaveAttribute("data-density", "full");
      await expect(sgh.getByTestId("status-badge")).toHaveText("▲Higher than usual");
      await expect(sgh.getByTestId("status-hours")).toHaveText("5.0 h");
      await expect(sgh.getByTestId("status-delta")).toHaveText("▲ 25%+25% vs usual");
      await expect(sgh.getByTestId("sparkline")).toBeAttached();
      // No usual level: no percentage, never a 0%.
      await expect(page.locator('[data-testid=status-card][data-hospital="AH"]').getByTestId("status-delta")).toHaveCount(0);
    }
  });

  test("the summary strip: four tiles from the cards figures, dated and sourced once", async ({ page }) => {
    await page.goto("/?view=planner");
    const strip = page.getByTestId("summary-strip");
    const tiles = strip.getByTestId("summary-tile");
    expect(await tiles.evaluateAll((els) => els.map((e) => e.getAttribute("data-tile")))).toEqual(["above", "longest", "change", "middle"]);
    // The date and source are stated once for the four tiles, not on each (docs/design/redesign_brief.md, principle 1).
    await expect(strip.getByTestId("provenance-line")).toHaveCount(0);
    await expect(strip.getByTestId("section-meta")).toHaveCount(1);
    await expect(strip.getByTestId("section-meta")).toContainText(/Source: .+ · Data as of \d{1,2} [A-Z][a-z]{2,3} \d{4}/);
    await expect(tiles.filter({ hasText: /Data as of|Source:/ })).toHaveCount(0);
    // Fixture: SGH +25% (higher); NUH has no usual level; AH, the urgent care centre, is left out of all four.
    const tile = (id: string) => strip.locator(`[data-tile="${id}"]`);
    await expect(tile("above")).toContainText("Emergency departments above usual");
    await expect(tile("above")).toContainText("1 of 2");
    await expect(tile("above").getByTestId("above-unknown")).toHaveText("1 with no comparison.");
    await expect(strip.getByTestId("summary-ucc-note")).toContainText("The urgent care centre is left out of these four figures.");
    await expect(tile("change")).toContainText("+25%");
    await expect(tile("change")).toContainText("Biggest change vs usual (previous 8 complete weeks)");
    // Short name and code on the tile; the full name in its tooltip (audit G4).
    await expect(tile("change").getByTestId("hospital-name")).toContainText("Singapore General (SGH)");
    await expect(tile("middle")).toContainText("Needs 3+ emergency departments");   // 2 full EDs here: no middle value, said so
  });

  test("the list behind 'above usual' opens on keyboard focus and closes on Escape", async ({ page }) => {
    await page.goto("/?view=planner");
    const trigger = page.getByTestId("above-list").getByRole("button");
    await trigger.focus();
    const tip = page.getByTestId("above-list").getByRole("tooltip");
    await expect(tip).toBeVisible();
    await expect(tip).toContainText("Singapore General Hospital (SGH): +25% vs usual");
    await page.keyboard.press("Escape");
    await expect(tip).toBeHidden();
  });

  test("the cards' order is in the URL: against usual, hours, A–Z", async ({ page }) => {
    const order = async () => page.getByTestId("status-card").evaluateAll((els) => els.map((e) => e.getAttribute("data-hospital")));
    await page.goto("/?view=planner");
    // The EDs in order, then the urgent care centre in its own group (ADR 0012).
    expect(await order()).toEqual(["SGH", "NUH", "AH"]);                                   // no usual level last, then by code
    await expect(page.locator('[data-testid="status-group"][data-group="ucc"] [data-testid="status-card"]')).toHaveCount(1);
    const nav = page.getByRole("navigation", { name: "Order of the hospitals" });
    await nav.getByRole("link", { name: "A–Z" }).click();
    await expect(page).toHaveURL(/\?view=planner&sort=name$/);
    expect(await order()).toEqual(["NUH", "SGH", "AH"]);                                  // National, Singapore; then the UCC
    await expect(nav.getByRole("link", { name: "A–Z" })).toHaveAttribute("aria-current", "true");
    await nav.getByRole("link", { name: "Hours" }).click();
    await expect(page).toHaveURL(/sort=hours$/);
    expect((await order())[0]).toBe("SGH");                                                // the only hospital with a complete week
    await page.goto("/?view=planner&sort=bogus");                                          // unknown order: the default
    expect(await order()).toEqual(["SGH", "NUH", "AH"]);
    await page.goto("/");                                                                  // Public has no order control
    await expect(page.getByTestId("sort-links")).toHaveCount(0);
  });

  test("the whole card links to the hospital's trends", async ({ page }) => {
    await page.goto("/?view=planner");
    const card = page.locator('[data-testid=status-card][data-hospital="SGH"]');
    const box = (await card.boundingBox())!;
    await card.click({ position: { x: box.width - 8, y: box.height - 8 } });              // a corner, away from the title text
    await expect(page).toHaveURL(/\/ed-trends\?hospital=SGH/);
  });

  test("planner at 1280×800: the summary strip is above the fold and the first row of cards starts within a screen and a half", async ({ page }) => {
    test.skip(narrow(page), "the fold is a desktop measure");
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/?view=planner");
    // Text wraps differently with each machine's fonts (CI's Linux fonts made a card ~100px taller than a Mac's), so a card's
    // exact bottom is not a stable measure. What matters: the summary strip is entirely in view, and each first-row card
    // starts early enough (CARDS_START_BY). CI's fonts put the cards
    // about 100px lower than a Mac's, so this has room for that.
    // The type scale (docs/design/redesign_brief.md, "Fonts and type scale") made the text 1 to 2px larger, which moved the first
    // row of cards below the first 800px: the strip is still wholly in view, and the cards start within a screen and a half.
    const CARDS_START_BY = 1200;
    const strip = (await page.getByTestId("summary-strip").boundingBox())!;
    expect(strip.y + strip.height, "summary strip bottom").toBeLessThanOrEqual(800);
    // The first row of the EDs' cards (the urgent care centre has its own group below them).
    for (const card of (await page.locator('[data-group="ed"] [data-testid="status-card"]').all()).slice(0, 4)) {
      const box = (await card.boundingBox())!;
      expect(box.y, "first row: top").toBeGreaterThanOrEqual(strip.y + strip.height - 1);
      expect(box.y, "first row: starts within a screen and a half").toBeLessThanOrEqual(CARDS_START_BY);
    }
    await page.screenshot({ path: "test-results/planner-1280x800.png" });
  });

  test("analyst: the statistics are open, with links to Data Quality and Methodology", async ({ page }) => {
    await page.goto("/?view=analyst");
    const links = page.getByTestId("analyst-links");
    await expect(links.getByRole("link", { name: "Data quality" })).toHaveAttribute("href", "/data-quality");
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

  test("the clinic search is never sent to the server, however the views are switched", async ({ page }) => {
    const urls: string[] = [];
    page.on("request", (r) => urls.push(r.url()));
    await page.goto("/#near=460001");
    await expect(page.getByTestId("nearby-place").first()).toBeVisible();
    await choose(page, "planner");
    await expect(page).toHaveURL(/\/\?view=planner$/);
    await expect(page.getByTestId("nearby")).toHaveCount(0);              // the planner view has no clinic finder
    await choose(page, "public");
    await expect(page.getByTestId("home")).toHaveAttribute("data-view", "public");
    await expect(page.getByTestId("clinic-finder")).toBeVisible();
    // Next may bring the address's fragment back with the page; the fragment stays in the browser.
    expect(urls.filter((u) => u.includes("460001"))).toEqual([]);
  });

  test("keyboard: Tab reaches the group once, arrow keys move the choice, focus is visible", async ({ page }) => {
    test.skip(narrow(page), "the header's segmented control is the wide layout; the menu sheet has its own keyboard test (e2e/frame.spec.ts)");
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
    await expect(page.getByRole("radio", { name: "Planner" })).toBeFocused();   // focus stays in the group
    await page.keyboard.press("ArrowRight");
    await expectView(page, "analyst");
    await page.keyboard.press("ArrowLeft");
    await expect(page).toHaveURL(/\?view=planner$/);
    await expectView(page, "planner");
    await expect(page.getByRole("radio", { name: "Planner" })).toBeFocused();

    // One Tab leaves the group: it is a single stop, not three.
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement?.matches('input[name="view"]'))).toBe(false);
  });

  test("works without JavaScript: the link, and the control as a form", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/?view=planner");
    await expect(page.getByTestId("summary-strip")).toHaveCount(1);
    await expect(page.getByTestId("status-card")).toHaveCount(3);
    // Without JavaScript the header's control is a plain form; below 768px the page has the three views as links.
    if (narrow(page)) await page.getByRole("navigation", { name: "View (no script)" }).getByRole("link", { name: "Analyst" }).click();   // a phone: plain links
    else {
      await page.getByTestId("view-radios").getByText("Analyst", { exact: true }).click();
      await page.getByRole("button", { name: "Change view" }).click();
    }
    await expect(page).toHaveURL(/\?view=analyst$/);
    await expect(page.getByTestId("week-pattern")).toHaveCount(1);
    await context.close();
  });

  test("the control is only on the home page, however the page is reached", async ({ page }) => {
    await page.goto("/findings");
    await expect(page.getByTestId("view-switch")).toHaveCount(0);
    await expect(narrow(page) ? page.getByTestId("menu-button") : page.getByRole("navigation", { name: "Main" })).toBeVisible();

    // Following links, without a full page load: it goes when leaving the home page and returns with it.
    await page.goto("/?view=planner");
    await expect(page.getByTestId("view-switch")).toHaveCount(1);
    await goNav(page, "Methods");
    await expect(page.getByRole("heading", { level: 1, name: "Methodology" })).toBeVisible();
    await expect(page.getByTestId("view-switch")).toHaveCount(0);
    await goNav(page, "Home");
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
