import { expect, test } from "@playwright/test";

import { expectNoA11yViolations, expectNoHorizontalScroll } from "./helpers";

test.describe("Methodology", () => {
  test("covers sources, definitions, transformations, geospatial method and limits", async ({ page }) => {
    await page.goto("/methodology");
    await expect(page.getByRole("heading", { level: 1, name: "Methodology" })).toBeVisible();
    for (const h of ["Sources", "From download to published figure", "Emergency department measures", "Why SVY21 (EPSG:3414)",
                     "Limitations", "What this data can't tell you", "Metric definitions"]) {
      await expect(page.getByRole("heading", { level: 2, name: h })).toBeVisible();
    }
    await expect(page.getByRole("heading", { level: 3, name: "marts.fct_ed_daily" })).toBeVisible();   // from the data dictionary
    await page.getByRole("navigation", { name: "On this page" }).getByRole("link", { name: "What this data can't tell you" }).click();
    await expect(page).toHaveURL(/#what-this-data-cant-tell-you$/);
    await expectNoHorizontalScroll(page);
  });

  test("links between docs stay on the site", async ({ page }) => {
    await page.goto("/methodology");
    await page.getByRole("link", { name: "the data-quality checks" }).first().click();
    await expect(page).toHaveURL(/\/docs\/data-quality$/);
    await expect(page.getByRole("heading", { level: 1, name: "Data quality" })).toBeVisible();
  });

  test("passes axe WCAG 2.1 AA checks", async ({ page }) => {
    await page.goto("/methodology");
    await expectNoA11yViolations(page);
  });
});

test.describe("Case Study", () => {
  test("has the eight sections, a draft banner and every TODO(me) highlighted", async ({ page }) => {
    await page.goto("/case-study");
    await expect(page.getByRole("heading", { level: 2 })).toHaveText([
      "Problem statement", "Stakeholder map", "Personas", "Patient flow: as-is and to-be", "Prioritised requirements (MoSCoW)",
      "Success metrics", "Decision log", "Limitations and next steps"]);
    const banner = page.getByTestId("draft-banner");
    await expect(banner).toContainText(/Draft: \d+ items need the author's own input/);
    const n = Number((await banner.innerText()).match(/Draft: (\d+)/)![1]);
    await expect(page.locator(".todo-me")).toHaveCount(n);
    await expect(page.locator(".todo-me").first()).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test("draws the as-is and to-be diagrams", async ({ page }) => {
    await page.goto("/case-study");
    await expect(page.locator('[data-testid="mermaid"][data-rendered="true"]')).toHaveCount(2, { timeout: 20_000 });
    await expect(page.locator('[data-testid="mermaid"] svg').first()).toContainText("decision to admit");
  });

  test("the decision log opens each ADR", async ({ page }) => {
    await page.goto("/case-study");
    await page.getByRole("link", { name: "0003" }).click();
    await expect(page).toHaveURL(/\/decisions\/0003-svy21-for-distances-and-areas$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("0003: Compute every distance and area in SVY21");
    await expect(page.getByText("Status:")).toBeVisible();
  });

  test("passes axe WCAG 2.1 AA checks", async ({ page }) => {
    await page.goto("/case-study");
    await expect(page.locator('[data-testid="mermaid"][data-rendered="true"]')).toHaveCount(2, { timeout: 20_000 });
    await expectNoA11yViolations(page);
  });
});

test.describe("Decision records and docs", () => {
  for (const path of ["/decisions", "/decisions/0001-published-snapshot", "/docs/data-dictionary", "/docs/data-quality", "/docs/runbook"]) {
    test(`${path} renders and passes axe`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoA11yViolations(page);
    });
  }

  test("an unknown doc is a 404", async ({ page }) => {
    expect((await page.goto("/docs/secrets"))?.status()).toBe(404);
  });
});
