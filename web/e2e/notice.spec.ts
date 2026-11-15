import { expect, test } from "@playwright/test";

import { blockTiles } from "./helpers";

/** Every page says the site isn't medical advice and to call 995 (audit H1): the same line in the footer, so it's on all of them (E5). */
const ROUTES = ["/", "/?view=planner", "/?view=analyst", "/ed-trends", "/live", "/access-map", "/findings", "/summary", "/data-quality",
  "/methodology", "/glossary", "/case-study", "/about"];

test.beforeEach(async ({ page }) => blockTiles(page));

for (const route of ROUTES) {
  test(`${route} says it isn't medical advice and to call 995`, async ({ page }) => {
    await page.goto(route);
    const notice = page.getByTestId("footer-notice");
    await expect(notice).toContainText("Emergency? Call 995. This site shows public statistics, not medical advice.");
    await expect(notice.getByRole("link", { name: "Call 995" })).toHaveAttribute("href", "tel:995");
  });
}
