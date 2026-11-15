import { expect, test } from "@playwright/test";

import { DOWN, expectNoHorizontalScroll } from "./helpers";

const DATA_PAGES = ["/", "/findings", "/ed-trends", "/access-map", "/live", "/data-quality", "/summary"];

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
    // A static page: the line is loaded in the browser, so it is current even there.
    await page.goto(`${DOWN}/methodology`);
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

  test("one site name in the title and header, and the privacy note says page views (audit G3, G5)", async ({ page }) => {
    await page.goto("/methodology");
    await expect(page).toHaveTitle(/· Right-siting care$/);
    await expect(page.locator("header").first()).toContainText("Right-siting care");
    await expect(page.locator("footer").last()).toContainText("Page views are counted without cookies");
    await expect(page.locator("footer").last()).not.toContainText("Visits are counted");
  });

  test("/status.json gives the footer the release, and no figures", async ({ request }) => {
    const body = await (await request.get("/status.json")).json();
    expect(Object.keys(body).sort()).toEqual(["as_of", "ok", "release_url", "snapshot_id"]);
    expect(body.ok).toBe(true);
    const down = await (await request.get(`${DOWN}/status.json`)).json();
    expect(down).toEqual({ ok: false });
  });

  test("the nav has five sections and marks the current one; below 768px the same links are in the menu sheet", async ({ page }) => {
    await page.goto("/methodology");
    const wide = page.viewportSize()!.width >= 768;
    if (!wide) {
      await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();
      await page.getByTestId("menu-button").click();
    }
    const nav = wide ? page.getByRole("navigation", { name: "Main" }) : page.getByRole("navigation", { name: "Menu" });
    await expect(nav.getByRole("link")).toHaveText(["Home", "Findings", "Explore", "Methods", "About"].map((t) => new RegExp(`^${t}`)));
    await expect(nav.locator('a[aria-current="page"]')).toHaveText(/^Methods/);   // /methodology is under it
    for (const link of await nav.getByRole("link").all()) {
      const box = (await link.boundingBox())!;
      expect(box.x, await link.innerText()).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, await link.innerText()).toBeLessThanOrEqual(page.viewportSize()!.width);
      expect(box.height).toBeGreaterThanOrEqual(44);   // tap target
    }
  });

  test("the pages that moved under About are still there and mark About", async ({ page }) => {
    for (const path of ["/about", "/project", "/how-its-built", "/case-study"]) {
      await page.goto(path);
      if (page.viewportSize()!.width >= 768) await expect(page.getByRole("navigation", { name: "Main" }).locator('a[aria-current="page"]')).toHaveText("About");
    }
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
