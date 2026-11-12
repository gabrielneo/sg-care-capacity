import { expect, test } from "@playwright/test";

import { blockTiles, expectNoA11yViolations, expectNoHorizontalScroll } from "./helpers";

test.describe("site strip", () => {
  test.beforeEach(async ({ page }) => blockTiles(page));

  test("shows the overview, a pill per dataset and the 995 notice stays on the page", async ({ page }) => {
    await page.goto("/");
    const strip = page.getByTestId("site-strip");
    await expect(page.getByTestId("strip-summary")).toContainText(/\d+ of \d+ hospitals busier than usual|No hospital has a comparison/);
    await expect(page.getByTestId("strip-summary")).toHaveAttribute("href", "/?view=planner");
    const viewport = page.viewportSize()!;
    if (viewport.width >= 1280) {
      await expect(page.getByTestId("strip-pill").first()).toBeVisible();
      expect((await strip.boundingBox())!.height).toBeLessThanOrEqual(46);
    } else {
      await expect(page.getByTestId("strip-pill").first()).toBeHidden();
      await page.getByTestId("strip-details").click();
      await expect(page.getByTestId("strip-pill").first()).toBeVisible();
      await expect(page.getByTestId("strip-details")).toHaveAttribute("aria-expanded", "true");
    }
    await expect(page.getByText(/995/).first()).toBeVisible();
    // The count says where it comes from and when, in words, at every width (no tooltip needed): the line under it below 1280px,
    // the bed-wait pill beside it from 1280px.
    await expect(viewport.width >= 1280 ? page.locator('[data-pill="bed"]') : page.getByTestId("strip-basis"))
      .toContainText(/MOH.*(data )?as of \d{1,2} [A-Z][a-z]{2} \d{4}/);
    await expectNoHorizontalScroll(page);
    await expectNoA11yViolations(page, { wcag22: true });
  });

  test("each pill carries its own date, so the estimate never sits beside another source's date", async ({ page }) => {
    await page.goto("/");
    if (page.viewportSize()!.width < 1280) await page.getByTestId("strip-details").click();
    const bed = page.locator('[data-pill="bed"]');
    await expect(bed).toContainText("Bed waits · MOH");
    await expect(bed).toContainText(/as of \d{1,2} [A-Z][a-z]{2} \d{4}/);
    const doctor = page.locator('[data-pill="doctor"]');
    if (await doctor.count()) {
      await expect(doctor).toContainText(/updated \d{1,2} [A-Z][a-z]{2} \d{4}/);
      await expect(doctor).toContainText("NUHS");
      await expect(doctor).toContainText("some hospitals only");
    }
  });

  test("stays at the top while scrolling and never covers a focused field", async ({ page }) => {
    await page.goto("/");
    await page.mouse.wheel(0, 1500);
    await expect(page.getByTestId("site-strip")).toBeInViewport();
    expect((await page.getByTestId("site-strip").boundingBox())!.y).toBeLessThanOrEqual(1);
    // Tab through the page: whatever has focus never overlaps the strip where it currently is.
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press("Tab");
      const hit = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body || el.closest('[data-testid="site-strip"]') || el.matches('a[href="#main"]')) return null; // the skip link is drawn above the strip (z-50)
        const r = el.getBoundingClientRect();
        const s = document.querySelector('[data-testid="site-strip"]')!.getBoundingClientRect();
        return r.bottom > s.top && r.top < s.bottom && r.bottom > 0 ? el.outerHTML.slice(0, 120) : null;
      });
      expect(hit, "focused element under the strip").toBeNull();
    }
  });

  test("an anchor jump lands below the strip (scroll-padding-top)", async ({ page }) => {
    await page.goto("/methodology");
    const pad = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop));
    const strip = await page.getByTestId("site-strip").boundingBox();
    expect(pad).toBeGreaterThanOrEqual(strip!.height);
  });

  test("the strip is on other pages too", async ({ page }) => {
    await page.goto("/methodology");
    await expect(page.getByTestId("strip-summary")).toBeVisible();
    await expect(page.getByTestId("strip-clusters")).toHaveCount(0);
  });
});
