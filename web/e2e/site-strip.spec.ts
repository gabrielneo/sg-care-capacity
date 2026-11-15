import { expect, type Page, test } from "@playwright/test";

import { blockTiles, expectNoA11yViolations, expectNoHorizontalScroll } from "./helpers";

/**
 * The sticky status strip (audit E4): Planner and Analyst only, from 768px, and only once the page's intro has scrolled away.
 * Everything else (the public view, every other page, every phone) has no strip.
 */
const wide = (page: Page) => (page.viewportSize()?.width ?? 1280) >= 768;
const scrollPastIntro = async (page: Page) => { await page.evaluate(() => window.scrollTo(0, 700)); };

test.beforeEach(async ({ page }) => blockTiles(page));

for (const view of ["planner", "analyst"] as const) {
  test.describe(`${view} view`, () => {
    test("appears only after the intro has scrolled away, and goes again at the top", async ({ page }) => {
      test.skip(!wide(page), "never on a phone: see the next test");
      await page.goto(`/?view=${view}`);
      const strip = page.getByTestId("site-strip");
      await expect(strip).toBeHidden();                 // at the top, the intro is in view
      await scrollPastIntro(page);
      await expect(strip).toBeVisible();
      expect((await strip.boundingBox())).toMatchObject({ y: 0, height: 40 });
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect(strip).toBeHidden();
    });

    test("never shows on a phone, however far the page is scrolled", async ({ page }) => {
      test.skip(wide(page), "a phone-width test");
      await page.goto(`/?view=${view}`);
      await scrollPastIntro(page);
      await page.mouse.wheel(0, 1200);
      await expect(page.getByTestId("site-strip")).toBeHidden();
    });

    test("says how many EDs are higher than usual and which week, as plain text, with the dataset's freshness", async ({ page }) => {
      test.skip(!wide(page), "desktop only");
      await page.goto(`/?view=${view}`);
      await scrollPastIntro(page);
      const summary = page.getByTestId("strip-summary");
      await expect(summary).toContainText(/\d+ of \d+ emergency departments higher than usual · week of |No comparison with usual yet/);
      await expect(summary).not.toContainText(/busier|busy/i);
      await expect(summary.locator("a")).toHaveCount(0);                                        // not a link, so not underlined
      expect(await summary.evaluate((el) => getComputedStyle(el).textDecorationLine)).toBe("none");
      // The same count as the summary tile below it: one rule, one number.
      const tile = await page.locator('[data-tile="above"] .text-kpi').first().innerText();
      await expect(summary).toContainText(`${tile.replace(/\s*of\s*/, " of ").split(" of ")[0]!.trim()} of`);
      // A symbol and words (never colour alone), then each dataset's own date in the panel.
      const fresh = page.getByTestId("strip-freshness");
      await expect(fresh).toContainText(/MOH data: (Up to date|Due an update|Overdue|Date unknown)/);
      await fresh.click();
      await expect(page.locator('[data-pill="bed"]')).toContainText(/as of \d{1,2} [A-Z][a-z]{2} \d{4}/);
      const doctor = page.locator('[data-pill="doctor"]');
      if (await doctor.count()) {
        await expect(doctor).toContainText(/updated \d{1,2} [A-Z][a-z]{2} \d{4}/);
        await expect(doctor).toContainText("some hospitals only");
      }
    });

    test("Jump to section lists the view's sections, jumps to one below the strip, and closes with Esc", async ({ page }) => {
      test.skip(!wide(page), "desktop only");
      await page.goto(`/?view=${view}`);
      await scrollPastIntro(page);
      const jump = page.getByTestId("strip-jump");
      await jump.click();
      const list = page.getByTestId("strip-jump-list");
      const links = list.getByRole("link");
      await expect(links.first()).toBeVisible();
      const hrefs = await links.evaluateAll((els) => els.map((e) => e.getAttribute("href")));
      expect(hrefs.length).toBeGreaterThanOrEqual(view === "analyst" ? 5 : 4);
      for (const href of hrefs) expect(await page.locator(href!).count(), href!).toBe(1);   // every stop exists on the page
      // Jumping lands the section's heading under the strip, not behind it.
      const target = hrefs.at(-1)!;
      await links.last().click();
      await expect(list).toBeHidden();
      await expect(page).toHaveURL(new RegExp(`${target}$`));
      const [strip, section] = await Promise.all([page.getByTestId("site-strip").boundingBox(), page.locator(target).boundingBox()]);
      expect(section!.y).toBeGreaterThanOrEqual(strip!.y + strip!.height - 1);
      // Esc closes the list and gives focus back to its button.
      await jump.click();
      await expect(list).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(list).toBeHidden();
      await expect(jump).toBeFocused();
    });

    test("fits the screen and passes the accessibility checks, with the strip showing", async ({ page }) => {
      await page.goto(`/?view=${view}`);
      await scrollPastIntro(page);
      await expectNoHorizontalScroll(page);
      await expectNoA11yViolations(page, { wcag22: true });
    });
  });
}

test("the public view has no strip", async ({ page }) => {
  await page.goto("/");
  await scrollPastIntro(page);
  await expect(page.getByTestId("site-strip")).toHaveCount(0);
});

test("no other page has a strip", async ({ page }) => {
  for (const path of ["/methodology", "/ed-trends", "/findings", "/about"]) {
    await page.goto(path);
    await expect(page.getByTestId("site-strip"), path).toHaveCount(0);
  }
});

test("an anchor jump lands below the strip (scroll-padding-top)", async ({ page }) => {
  await page.goto("/methodology");
  const pad = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop));
  expect(pad).toBeGreaterThanOrEqual(40);   // the strip is 40px
});
