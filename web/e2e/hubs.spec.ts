import { expect, test } from "@playwright/test";

import { DOWN, expectNoA11yViolations, expectNoHorizontalScroll } from "./helpers";

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
      // From 768px the header's nav; below it the same links are in the menu sheet.
      const phone = page.viewportSize()!.width < 768;
      if (phone) await page.getByTestId("menu-button").click();
      await expect(page.getByRole("navigation", { name: phone ? "Menu" : "Main" }).locator('a[aria-current="page"]')).toHaveCount(1);
    });

    test("fits the screen and passes the accessibility checks", async ({ page }) => {
      await page.goto(hub.path);
      await expectNoHorizontalScroll(page);
      await expectNoA11yViolations(page, { wcag22: true });
    });
  });
}

test.describe("/explore previews (audit G2)", () => {
  test("each card previews its page's latest figure, with its date and source once, as plain text inside the link", async ({ page }) => {
    await page.goto("/explore");
    const previews = page.getByTestId("hub-preview");
    await expect(previews).toHaveCount(3);
    // The fixture: SGH above usual, NUH with no comparison, Alexandra (urgent care) left out.
    await expect(previews.nth(0)).toContainText(/^1 of 2 emergency departments above usual, week of .+; 1 with no comparison/);
    // The fixture has 2 areas; one has no rate, and is not counted.
    await expect(previews.nth(1).locator("span").first()).toHaveText("Clinics for each 1,000 residents aged 65+, in 1 planning area");
    await expect(previews.nth(2)).toContainText(/Estimates from \d+ NUHS sites?/);
    for (let i = 0; i < 3; i++) {
      await expect(previews.nth(i).getByTestId("hub-preview-provenance")).toHaveText(/^Data as of \d{1,2} [A-Z][a-z]{2,3} \d{4}.* · Source: .+/);
      await expect(previews.nth(i).locator("a, button")).toHaveCount(0);       // nothing interactive inside the card's link
    }
  });

  test("with the API down, the cards still link to their pages and show no figure", async ({ page }) => {
    await page.goto(`${DOWN}/explore`);
    await expect(page.getByTestId("hub-preview")).toHaveCount(0);
    for (const href of ["/ed-trends", "/access-map", "/live"]) await expect(page.getByTestId("hub").locator(`a[href="${href}"]`)).toHaveCount(1);
  });
});
