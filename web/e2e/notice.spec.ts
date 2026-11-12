import { expect, test } from "@playwright/test";

import { blockTiles } from "./helpers";

/** Every page says the site isn't medical advice and to call 995 (audit H1): in the footer, so it's on all of them. */
const ROUTES = ["/", "/?view=planner", "/?view=analyst", "/ed-trends", "/live", "/access-map", "/findings", "/summary", "/data-quality",
  "/methodology", "/glossary", "/case-study"];

test.beforeEach(async ({ page }) => blockTiles(page));

for (const route of ROUTES) {
  test(`${route} says it isn't medical advice and to call 995`, async ({ page }) => {
    await page.goto(route);
    const notice = page.getByTestId("footer-notice");
    await expect(notice).toContainText("isn't medical advice");
    await expect(notice).toContainText("call 995");
    await expect(notice.getByRole("link", { name: "995" })).toHaveAttribute("href", "tel:995");
  });
}
