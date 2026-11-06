import { expect, test } from "@playwright/test";

import { expectAsOfOnEveryCard, expectNoA11yViolations, expectNoHorizontalScroll, seen } from "./helpers";

test.describe("Data Quality", () => {
  test("summarises the run and groups results by what a failure does", async ({ page }) => {
    await page.goto("/data-quality");
    const tile = (label: string) => page.getByTestId("kpi-tile").filter({ hasText: label });
    await expect(tile("Checks run on this data release")).toContainText("5");
    await expect(tile("Failures that stop publishing")).toContainText("0");
    await expect(tile("Warnings raised")).toContainText("1");
    await expect(tile("Records set aside")).toContainText("1");

    await expect(page.getByTestId("checks-blocking")).toContainText("Every check in this group passed.");
    const quarantine = page.getByTestId("checks-quarantine");
    await expect(quarantine.locator('tr[data-status="fail"]')).toContainText("clinic.coordinates_in_singapore");
    const link = quarantine.getByRole("link", { name: "clinic.coordinates_in_singapore" });
    await expect(link).toHaveAttribute("href", /^\/docs\/data-quality#clinic/);
    const warn = page.getByTestId("checks-warn");
    await expect(warn.locator('tr[data-status="fail"]')).toContainText("range.bed_wait_over_24h");
    await expect(warn.locator('tr[data-status="skipped"]')).toContainText("reconcile.nuhs_vs_moh_nuh");
    await warn.getByText(/Show 1 passed checks/).click();
    await expect(warn.locator('tr[data-status="pass"]')).toContainText("freshness.population_15_months");

    await expectAsOfOnEveryCard(page, 7);
    await expectNoHorizontalScroll(page);
  });

  test("the coverage grid shows each hospital-day, with gaps listed as text", async ({ page }) => {
    await page.goto("/data-quality");
    const grid = page.getByTestId("coverage-grid");
    await expect(grid.locator("rect[data-state]")).toHaveCount(3 * 91);                  // 3 hospitals x 13 weeks
    await expect(grid.locator('rect[data-state="wait_only"]')).toHaveCount(1);          // AH, 7 Oct: no attendances
    const gaps = page.getByTestId("coverage-gaps");
    expect(await seen(gaps)).toContain("one figure only: 7 Oct 2026");
    expect(await seen(gaps.locator("li").filter({ hasText: "National University Hospital" }))).toContain("missing:");
    await page.getByRole("link", { name: "26 weeks" }).click();
    await expect(page).toHaveURL(/weeks=26/);
    await expect(grid.locator("rect[data-state]")).toHaveCount(3 * 182);
  });

  test("lists every source with its freshness", async ({ page }) => {
    await page.goto("/data-quality");
    const table = page.getByTestId("freshness-table");
    await expect(table.locator("tbody tr")).toHaveCount(7);
    await expect(table.locator("tbody tr").filter({ hasText: "Clinics" }).filter({ hasText: "data.gov.sg" }).first()).toContainText("6 Jun 2024");
    await expect(table).toContainText("Latest day reported");                // plain basis, no internal names
    await expect(table).not.toContainText("report_date");
  });

  test("passes axe WCAG 2.1 AA checks", async ({ page }) => {
    await page.goto("/data-quality");
    await expectNoA11yViolations(page);
  });
});
