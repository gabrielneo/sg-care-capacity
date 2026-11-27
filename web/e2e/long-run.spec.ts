import { expect, test } from "@playwright/test";

import { expectNoA11yViolations, expectNoHorizontalScroll, expectProvenanceOnEveryFrame } from "./helpers";

/** The long-run charts: every past week marked as the badge marks the latest, each hospital's every week, and the tested pairs. */
test.describe("Long-run charts", () => {
  test("ED Trends marks every past week of each hospital, in a scroller a keyboard can reach", async ({ page }) => {
    await page.goto("/ed-trends");
    const card = page.getByTestId("chart-frame").filter({ hasText: "Unusual weeks" });
    await expect(card.getByTestId("week-row").first()).toBeVisible();
    await expect(card.getByTestId("weeks-scroller")).toHaveAttribute("tabindex", "0");
    await expect(card.getByTestId("week-legend")).toContainText("Much higher than usual");
    await expectNoHorizontalScroll(page);
  });

  test("a hospital's page draws every week with the trend test's weeks shaded, and the days its published link was tested on", async ({ page }) => {
    await page.goto("/hospital/SGH");
    await expect(page.getByTestId("every-week")).toBeVisible();
    await expect(page.getByTestId("trend-sentence")).toContainText("hours a week");
    await expect(page.getByTestId("scatter")).toBeVisible();
    await expect(page.getByTestId("scatter-sentence")).toContainText("an association only");
    await expectProvenanceOnEveryFrame(page);
    await expectNoHorizontalScroll(page);
    await expectNoA11yViolations(page);
  });

  test("ED Trends shows how each hospital's days spread around its weekly figures", async ({ page }) => {
    await page.goto("/ed-trends");
    const card = page.getByTestId("chart-frame").filter({ hasText: "How the days spread" });
    await expect(card.getByTestId("spread-row").first()).toBeVisible();
    await expect(card.getByTestId("spread-legend")).toContainText("Average (as in the weekly figures)");
    await expectNoHorizontalScroll(page);
  });

  test("a hospital with no published link has no scatter", async ({ page }) => {
    await page.goto("/hospital/AH");
    await expect(page.getByTestId("scatter")).toHaveCount(0);
  });
});
