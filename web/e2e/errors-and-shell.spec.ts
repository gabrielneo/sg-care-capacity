import { expect, test } from "@playwright/test";

import { DOWN, expectNoHorizontalScroll } from "./helpers";

const DATA_PAGES = ["/", "/ed-trends", "/access-map", "/live", "/data-quality", "/summary"];

test.describe("when the API is down", () => {
  for (const path of DATA_PAGES) {
    test(`${path} shows an error and no figures`, async ({ page }) => {
      await page.goto(`${DOWN}${path}`);
      // (Next adds its own empty role="alert" route announcer, so match by text.)
      await expect(page.getByRole("alert").filter({ hasText: "The data service isn't responding." })).toBeVisible();
      await expect(page.getByTestId("provenance-line")).toHaveCount(0);
      await expectNoHorizontalScroll(page);
    });
  }

  test("the footer says the data release isn't available", async ({ page }) => {
    // A page rendered per request: static pages (e.g. /methodology) keep the line from their last
    // build or hourly refresh, like every other cached API response.
    await page.goto(`${DOWN}/`);
    await expect(page.getByTestId("data-status")).toHaveText("Data release: not available right now.");
  });
});

test.describe("shell", () => {
  test("the footer names the data release the API is serving", async ({ page, request }) => {
    const meta = await (await request.get("http://127.0.0.1:8791/api/v1/meta")).json() as
      { data: { snapshot_id: string; release_url: string | null } };
    await page.goto("/methodology");
    const status = page.locator("footer").getByTestId("data-status");
    await expect(status).toContainText(`Data release ${meta.data.snapshot_id}, as of `);
    await expect(status).toHaveText(/as of \d{1,2} [A-Z][a-z]{2} \d{4}/);
    // The e2e API serves a local snapshot, so there is no release page to link to.
    expect(meta.data.release_url).toBeNull();
    await expect(status.getByRole("link")).toHaveCount(0);
  });

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

});
