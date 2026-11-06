import { expect, test } from "@playwright/test";

import { expectAsOfOnEveryCard, expectNoA11yViolations, expectNoHorizontalScroll } from "./helpers";

test.describe("ED Trends", () => {
  test("draws the three charts with labels, gaps counted and an as-of date on each", async ({ page }) => {
    await page.goto("/ed-trends");
    for (const title of ["Daily median wait for a ward bed", "Day-of-week pattern", "Wait vs attendances"]) {
      await expect(page.getByRole("heading", { level: 2, name: title })).toBeVisible();
    }
    await expect(page.getByTestId("chart-daily-wait").locator(".recharts-line-curve")).toHaveCount(3);
    await expect(page.getByText("AH = urgent care centre; NUH = adults only.").first()).toBeVisible();
    // Default range is 3 Aug to 31 Oct; the fixture starts on 14 Sep and has no NUH rows.
    await expect(page.getByTestId("gap-summary")).toHaveText("Days with no figure in this range: AH 42, NUH 90, SGH 42.");
    await expectAsOfOnEveryCard(page, 3);
    await expectNoHorizontalScroll(page);
  });

  test("tooltips give the exact date and the unit (hover, or tap on touch screens)", async ({ page }, info) => {
    await page.goto("/ed-trends?hospital=SGH&from=2026-10-01&to=2026-10-31");
    const daily = page.getByTestId("chart-daily-wait");
    await daily.scrollIntoViewIfNeeded();
    const box = (await daily.locator(".recharts-surface").boundingBox())!;
    const [x, y] = [box.x + box.width * 0.75, box.y + box.height / 2];
    if (info.project.use.hasTouch) await page.touchscreen.tap(x, y);
    else await page.mouse.move(x, y);
    const tip = daily.locator(".recharts-tooltip-wrapper");
    await expect(tip).toContainText(/[A-Z][a-z]{2}, \d{1,2} Oct 2026/);
    await expect(tip).toContainText(/SGH median wait:\s*\d+\.\d hours/);
  });

  test("filters by hospital through the form, keeping the URL shareable", async ({ page }) => {
    await page.goto("/ed-trends");
    await page.getByRole("checkbox", { name: /^AH / }).uncheck();
    await page.getByRole("checkbox", { name: /^NUH / }).uncheck();
    await page.getByRole("button", { name: "Show" }).click();
    await expect(page).toHaveURL(/hospital=SGH/);
    await expect(page.getByTestId("chart-daily-wait").locator(".recharts-line-curve")).toHaveCount(1);
  });

  test("a hospital with no figures gets an empty state, not a flat line", async ({ page }) => {
    await page.goto("/ed-trends?hospital=NUH");
    await expect(page.getByText("No MOH figures for this selection")).toBeVisible();
    await expect(page.getByTestId("chart-card")).toHaveCount(0);
  });

  test("a range over 2 years shows the API's reason", async ({ page }) => {
    await page.goto("/ed-trends?from=2023-01-01&to=2026-10-31");
    const alert = page.getByRole("alert").filter({ hasText: "These dates can't be shown" });
    await expect(alert).toBeVisible();
    await expect(alert).toContainText("at most 2 years apart");
  });

  test("ignores an unknown hospital code and says so", async ({ page }) => {
    await page.goto("/ed-trends?hospital=XYZ&hospital=SGH");
    await expect(page.getByText("Ignored unknown hospital code: XYZ.")).toBeVisible();
  });

  test("passes axe WCAG 2.1 AA checks", async ({ page }) => {
    await page.goto("/ed-trends");
    await expectNoA11yViolations(page);
  });
});
