import { expect, test } from "@playwright/test";

import { expectAsOfOnEveryCard, expectNoA11yViolations, expectNoHorizontalScroll } from "./helpers";

test.describe("Overview", () => {
  test("shows this week's figures, the summary and an as-of date on every card", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "This week in Singapore's emergency departments" })).toBeVisible();
    await expect(page.getByText("The latest complete week MOH has published: 19–25 Oct 2026.")).toBeVisible();

    const summary = page.getByTestId("chart-card").filter({ hasText: "In plain English" });
    await expect(summary).toContainText(
      "ranged from 2.0 hours at Alexandra Hospital (an urgent care centre) to 5.0 hours at Singapore General Hospital.");
    await expect(summary).toContainText("The one hospital with a comparison, Singapore General Hospital, was above its previous 4-week average.");
    await expect(summary).toContainText("Together the 2 hospitals recorded 3,850 attendances.");
    await expect(summary).toContainText("National University Hospital has no complete data for that week and is left out.");

    const sgh = page.getByTestId("kpi-tile").filter({ hasText: "Singapore General Hospital (SGH)" });
    await expect(sgh).toContainText("5");
    await expect(sgh).toContainText("+25%");
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
