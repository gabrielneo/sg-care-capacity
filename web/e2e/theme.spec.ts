import { expect, test } from "@playwright/test";

import { blockTiles, expectNoA11yViolations, expectNoHorizontalScroll } from "./helpers";

const ROUTES = ["/", "/find", "/ed-trends", "/access-map", "/live", "/data-quality"];

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    for (const route of ROUTES) {
      test(`${route}: passes axe (WCAG 2.2 AA) and does not scroll sideways`, async ({ page }) => {
        await blockTiles(page);
        await page.goto(route);
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(400);       // a drawer or story step still fading in would be read half transparent
        const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
        expect(bg).toBe(scheme === "light" ? "rgb(247, 251, 250)" : "rgb(8, 20, 28)");
        await expectNoA11yViolations(page, { wcag22: true });
        await expectNoHorizontalScroll(page);
      });
    }
  });
}

test.describe("no theme switch", () => {
  test("the footer has no theme control, and nothing is saved or forced on <html>", async ({ page }) => {
    await page.goto("/methodology");
    await expect(page.getByTestId("theme-toggle")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /theme/i })).toHaveCount(0);
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
  });

  test("a theme saved by the old toggle is ignored: the page follows the device", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("theme", "dark"));
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/methodology");
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(247, 251, 250)");
  });
});

test.describe("/styleguide", () => {
  test("is noindex, shows both themes, and keeps the 995 notice reachable", async ({ page }) => {
    await page.goto("/styleguide");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page.getByTestId("specimen-light")).toBeVisible();
    await expect(page.getByTestId("specimen-dark")).toBeVisible();
    await expect(page.getByTestId("sample-chart").first()).toBeVisible();
    await expect(page.getByTestId("footer-notice")).toContainText("995");
    const bgs = await page.evaluate(() => ["light", "dark"].map((t) => getComputedStyle(document.querySelector(`[data-testid="specimen-${t}"]`)!).backgroundColor));
    expect(bgs).toEqual(["rgb(247, 251, 250)", "rgb(8, 20, 28)"]);
    await expectNoHorizontalScroll(page);
  });

  test("is linked from the footer and nowhere in the main navigation", async ({ page }) => {
    await page.goto("/methodology");
    await expect(page.locator("footer").getByRole("link", { name: "Style guide" })).toHaveAttribute("href", "/styleguide");
    await expect(page.getByRole("navigation", { name: "Main" }).locator('a[href="/styleguide"]')).toHaveCount(0);
  });

  for (const scheme of ["light", "dark"] as const) {
    test(`passes axe in ${scheme}`, async ({ browser }) => {
      const ctx = await browser.newContext({ colorScheme: scheme, baseURL: "http://127.0.0.1:3301" });
      const page = await ctx.newPage();
      await page.goto("/styleguide");
      await expectNoA11yViolations(page, { wcag22: true });
      await ctx.close();
    });
  }
});

test.describe("widths", () => {
  for (const width of [375, 768, 1280, 1440]) {
    test(`no horizontal overflow at ${width}px on the redesigned pages`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await blockTiles(page);
      for (const route of ["/project", "/styleguide", "/", "/find"]) {
        await page.goto(route);
        await expectNoHorizontalScroll(page);
      }
    });
  }
});
