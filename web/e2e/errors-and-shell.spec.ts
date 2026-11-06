import { expect, test } from "@playwright/test";

import { DOWN, expectNoA11yViolations, expectNoHorizontalScroll } from "./helpers";

const DATA_PAGES = ["/", "/ed-trends", "/access-map", "/live"];

test.describe("when the API is down", () => {
  for (const path of DATA_PAGES) {
    test(`${path} shows an error and no figures`, async ({ page }) => {
      await page.goto(`${DOWN}${path}`);
      // (Next adds its own empty role="alert" route announcer, so match by text.)
      await expect(page.getByRole("alert").filter({ hasText: "The API could not be reached" })).toBeVisible();
      await expect(page.getByTestId("provenance-line")).toHaveCount(0);
      await expectNoHorizontalScroll(page);
    });
  }
});

test.describe("shell", () => {
  test("the nav reaches every section and marks the current one", async ({ page }) => {
    await page.goto("/methodology");
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav.getByRole("link")).toHaveText(["Overview", "ED Trends", "Access Map", "Live", "Data Quality", "Methodology", "Case Study"]);
    await expect(nav.getByRole("link", { name: "Methodology" })).toHaveAttribute("aria-current", "page");
  });

  test("the skip link is the first thing a keyboard user reaches", async ({ page }) => {
    await page.goto("/methodology");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  });

  test("/dev/components is hidden in a production build", async ({ page }) => {
    const res = await page.goto("/dev/components");
    expect(res?.status()).toBe(404);
  });

  for (const path of ["/data-quality", "/methodology", "/case-study"]) {
    test(`${path} passes axe WCAG 2.1 AA checks`, async ({ page }) => {
      await page.goto(path);
      await expectNoA11yViolations(page);
    });
  }
});
