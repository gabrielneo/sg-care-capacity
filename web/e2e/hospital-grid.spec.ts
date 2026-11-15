import { existsSync } from "node:fs";
import path from "node:path";

import { expect, type Locator, type Page, test } from "@playwright/test";

import { expectNoA11yViolations, expectNoHorizontalScroll } from "./helpers";

/**
 * The hospital cards line up (audit D1-D4): 4 columns from 1280px, 2 from 768px, 1 below; every slot of a card (name, chips,
 * label, value, change, footer) starts at the same height as its neighbours' in the row; one focus stop per card; the
 * urgent care centre is one full-width card under the grid and is not among the ranked cards.
 * The 375px project only checks the compact layout; widths are set here, so the desktop project runs the rest.
 */
const GRID = '[data-testid=status-group][data-group=ed] [data-testid=status-card]';
const SLOTS = [".sc-name", ".sc-chips", ".sc-label", ".sc-value", ".sc-delta", ".sc-foot"];

// The e2e API fixture has three hospitals, too few for a grid: the layout is measured on the dev page's sample data (8 EDs and the
// urgent care centre), served by a second instance of the same build with SHOW_DEV_PAGES=true (playwright.config.ts).
const SAMPLE = "http://127.0.0.1:3303/dev/status-grid";

async function open(page: Page, width: number, scheme: "light" | "dark" = "light", url = SAMPLE) {
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
  await page.goto(url);
  await expect(page.getByTestId("status-grid")).toBeVisible();
}

/** The cards' boxes, grouped into the grid's rows (cards whose tops are within 1px are one row). */
async function rows(cards: Locator) {
  const boxes = await cards.evaluateAll((els) => els.map((e) => {
    const r = e.getBoundingClientRect();
    const top = (sel: string) => e.querySelector(sel)?.getBoundingClientRect().top ?? NaN;
    return { left: r.left, top: r.top, width: r.width, height: r.height, slots: [".sc-name", ".sc-chips", ".sc-label", ".sc-value", ".sc-delta", ".sc-foot"].map(top) };
  }));
  const out: (typeof boxes)[] = [];
  for (const b of boxes) {
    const row = out.find((r) => Math.abs(r[0]!.top - b.top) <= 1);
    if (row) row.push(b); else out.push([b]);
  }
  return out;
}

for (const [width, columns] of [[1440, 4], [1280, 4], [768, 2]] as const) {
  test.describe(`${width}px`, () => {
    test.skip(({ viewport }) => (viewport?.width ?? 0) < 1000, "set its own width; the desktop project runs it");

    test(`${columns} columns, and every slot lines up across a row`, async ({ page }) => {
      await open(page, width);
      const cards = page.locator(GRID);
      expect(await cards.count()).toBeGreaterThanOrEqual(columns);
      const grouped = await rows(cards);
      expect(Math.max(...grouped.map((r) => r.length))).toBe(columns);
      for (const row of grouped) {
        for (const b of row) {
          expect(Math.abs(b.height - row[0]!.height), "card heights in a row").toBeLessThanOrEqual(1);
          b.slots.forEach((t, i) => expect(Math.abs(t - row[0]!.slots[i]!), `${SLOTS[i]} top`).toBeLessThanOrEqual(1));
        }
      }
      await expectNoHorizontalScroll(page);
    });

    test("a short last row is left-aligned and no card is stretched", async ({ page }) => {
      await open(page, width);
      const all = (await rows(page.locator(GRID))).flat();
      const lefts = [...new Set(all.map((b) => Math.round(b.left)))].sort((a, b) => a - b);
      expect(lefts).toHaveLength(columns);
      for (const b of all) expect(Math.abs(b.width - all[0]!.width)).toBeLessThanOrEqual(1);
    });
  });
}

test("the urgent care centre is one full-width card under the grid, outside the ranked cards", async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 0) < 1000);
  await open(page, 1280);
  const ucc = page.getByTestId("status-ucc");
  await expect(ucc.getByRole("heading", { name: "Urgent care centre" })).toBeVisible();
  await expect(ucc.getByTestId("status-card")).toHaveCount(1);
  await expect(page.locator(GRID).filter({ has: page.locator('[data-hospital="AH"]') })).toHaveCount(0);
  const [gridBox, uccBox] = await Promise.all([page.locator('[data-testid=status-group][data-group=ed]').boundingBox(), ucc.getByTestId("status-card").boundingBox()]);
  expect(uccBox!.width).toBeGreaterThanOrEqual(gridBox!.width - 1);
  expect(uccBox!.y).toBeGreaterThan(gridBox!.y + gridBox!.height - 1);
});

test("a card is one focus stop, with a visible ring, named with its trend", async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 0) < 1000);
  await open(page, 1280);
  const card = page.locator(GRID).first();
  await expect(card.getByRole("link")).toHaveCount(1);
  await expect(card.getByRole("button")).toHaveCount(0);
  await card.getByRole("link").focus();
  await expect(card).toHaveCSS("outline-style", "solid");
  await expect(card.getByRole("link")).toHaveAccessibleName(/, (rising|falling|steady) over 12 weeks|, too few weeks to describe a trend$/);
});

test("only a card above usual has a status-coloured left edge", async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 0) < 1000);
  await open(page, 1280);
  const cards = page.locator(GRID);
  for (let i = 0; i < await cards.count(); i++) {
    const c = cards.nth(i);
    const level = await c.getAttribute("data-level");
    await expect(c).toHaveCSS("border-left-width", ["higher", "much_higher"].includes(level!) ? "3px" : "1px");
  }
});

test.describe("compact, at 375px", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) > 400);
  test("one column, no overflow, two lines and a meta line; no sparkline under 400px", async ({ page }) => {
    await open(page, 375);
    const grouped = await rows(page.locator(GRID));
    expect(grouped.every((r) => r.length === 1)).toBe(true);
    const card = page.locator(GRID).first();
    await expect(card.locator(".sc-label")).toBeHidden();
    await expect(card.locator(".sc-spark")).toBeHidden();
    await expect(card.getByTestId("status-badge")).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectNoA11yViolations(page, { wcag22: true });
  });
  test("the sparkline returns from 400px", async ({ page }) => {
    await open(page, 400);
    await expect(page.locator(GRID).first().locator(".sc-spark")).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});

test("no horizontal overflow at 375, 768, 1280 and 1440; axe is clean in both themes", async ({ page }) => {
  for (const width of [375, 768, 1280, 1440]) {
    await open(page, width, "light", "/?view=planner");   // the real page, on the fixture
    await expectNoHorizontalScroll(page);
    await open(page, width);
    await expectNoHorizontalScroll(page);
  }
  for (const scheme of ["light", "dark"] as const) {
    await open(page, 1280, scheme);
    await expectNoA11yViolations(page, { wcag22: true });
  }
});

// Visual snapshots of the grid on the sample data. Pixels differ by operating system, so the baselines are the Linux ones CI renders
// (`UPDATE_VISUAL=1 npx playwright test e2e/hospital-grid.spec.ts --update-snapshots` there, then commit e2e/hospital-grid.spec.ts-snapshots/).
for (const scheme of ["light", "dark"] as const) {
  test(`snapshot of the grid, ${scheme}`, async ({ page, viewport }) => {
    const baseline = path.join(__dirname, "hospital-grid.spec.ts-snapshots", `grid-${scheme}-desktop-linux.png`);
    test.skip((viewport?.width ?? 0) < 1000 || process.platform !== "linux" || (!existsSync(baseline) && !process.env.UPDATE_VISUAL),
              "baselines are rendered on Linux (CI) and committed; none yet");
    await open(page, 1280, scheme);
    await expect(page.getByTestId("status-grid")).toHaveScreenshot(`grid-${scheme}.png`, { maxDiffPixelRatio: 0.005 });
  });
}
