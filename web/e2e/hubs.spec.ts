import { expect, test } from "@playwright/test";

import { expectNoA11yViolations, expectNoHorizontalScroll } from "./helpers";

const HUBS = [
  { path: "/explore", links: ["/ed-trends", "/access-map", "/live"] },
  { path: "/how-its-built", links: ["/data-quality", "/methodology", "/docs/insights-method", "/decisions", "/glossary"] },
];

for (const hub of HUBS) {
  test.describe(`${hub.path} hub`, () => {
    test("links to every page in its section", async ({ page }) => {
      await page.goto(hub.path);
      for (const href of hub.links) await expect(page.getByTestId("hub").locator(`a[href="${href}"]`)).toHaveCount(1);
    });

    test("every page in it has a working link, and the section stays marked in the nav", async ({ page, request }) => {
      for (const href of hub.links) expect((await request.get(href)).status(), href).toBe(200);
      await page.goto(hub.links[0]!);
      await expect(page.getByRole("navigation", { name: "Main" }).locator('a[aria-current="page"]')).toHaveCount(1);
    });

    test("fits the screen and passes the accessibility checks", async ({ page }) => {
      await page.goto(hub.path);
      await expectNoHorizontalScroll(page);
      await expectNoA11yViolations(page, { wcag22: true });
    });
  });
}
