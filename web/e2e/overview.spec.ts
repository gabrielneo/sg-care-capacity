import { expect, test } from "@playwright/test";

import { expectAsOfOnEveryCard, expectNoA11yViolations, expectNoHorizontalScroll, seen } from "./helpers";

test.describe("Overview", () => {
  test("shows this week's figures, the summary and an as-of date on every card", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "This week in Singapore's emergency departments" })).toBeVisible();
    expect(await seen(page.locator("main header"))).toContain(
      "The latest complete week published by Ministry of Health (MOH): 19–25 Oct 2026.");

    const summary = await seen(page.getByTestId("chart-card").filter({ hasText: "In plain English" }).locator("p").first());
    expect(summary).toBe(
      "For 19–25 Oct 2026, the time waiting for a ward bed after the decision to admit ranged from 2.0 to 5.0 hours. " +
      "It was shortest at Alexandra Hospital's Urgent Care Centre (UCC) and longest at Singapore General Hospital. " +
      "The one hospital with a comparison, Singapore General Hospital, had a longer bed wait than its average for the previous 4 weeks. " +
      "Together they had 3,850 Emergency Department (ED) visits. " +
      "National University Hospital has no complete data for that week and is left out.");

    await expect(page.getByTestId("bed-wait-explainer")).toContainText("This is not the time to see a doctor.");
    const sgh = page.getByTestId("kpi-tile").filter({ hasText: "+25%" });
    expect(await seen(sgh)).toMatch(/^SGH 5 hours, average of each day's median ▲ \+25% vs its previous 4-week average/);
    await expect(page.getByTestId("kpi-tile").filter({ hasText: "Alexandra Hospital (AH)" })).toContainText("Urgent care centre");

    await expectAsOfOnEveryCard(page, 5);
    await expectNoHorizontalScroll(page);
  });

  test("links to the detail pages", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /^Access Map →/ }).click();
    await expect(page).toHaveURL(/\/access-map$/);
  });

  test("passes axe WCAG 2.1 AA checks", async ({ page }) => {
    await page.goto("/");
    await expectNoA11yViolations(page);
  });
});
