import { expect, type Locator, test } from "@playwright/test";

import { expectAsOfOnEveryCard, expectNoA11yViolations, expectNoHorizontalScroll, seen } from "./helpers";

/** Text as read, without glossary tooltips or screen-reader-only text. */
const plain = (locator: Locator) => locator.evaluate((el) => {
  const copy = el.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('[role="tooltip"], .sr-only').forEach((n) => n.remove());
  return (copy.textContent ?? "").replace(/\s+/g, " ").trim();
});

// The fixture: SGH and AH from 24 Aug to 31 Oct 2026, NUH in the reference list with no figures.
// SGH's latest complete week (19-25 Oct) is 5.0 hours against a usual level of 4.0; AH's 5 Oct week is
// incomplete (a missing attendance day), so AH has 7 of the 8 weeks a usual level needs.

test.describe("ED Trends: difference-first charts", () => {
  test("four charts, each with Data as of and its source", async ({ page }) => {
    await page.goto("/ed-trends");
    for (const title of ["Time waiting for a ward bed after the decision to admit", "The latest week against the usual level",
                         "Bed wait by day of the week"]) {
      await expect(page.getByRole("heading", { level: 2, name: title })).toBeVisible();
    }
    await expect(page.getByRole("heading", { level: 2, name: /estimate and .*figure/ })).toBeVisible();
    expect(await seen(page.getByTestId("bed-wait-explainer"))).toBe(
      "This is not the time to see a doctor. It measures how long admitted patients wait in the ED for a ward bed.");
    expect(await seen(page.getByTestId("gap-summary"))).toBe("Days with no figure in this range: AH 21, NUH 90, SGH 21.");
    await expectAsOfOnEveryCard(page, 4);
    await expectNoHorizontalScroll(page);
  });

  test("by default each hospital is compared with its own usual level", async ({ page }) => {
    await page.goto("/ed-trends");
    await expect(page.getByRole("link", { name: "Each against its own usual level" })).toHaveAttribute("aria-current", "page");
    const multiples = page.getByTestId("multiple");
    await expect(multiples).toHaveCount(3);
    await expect(page.locator('[data-testid=multiple][data-hospital="SGH"] [data-testid=series]')).not.toHaveCount(0);
    await expect(page.locator('[data-testid=multiple][data-hospital="AH"]'))
      .toContainText("No usual level: 7 of the 8 weeks before 19–25 Oct 2026 are complete.");
    await expect(page.locator('[data-testid=multiple][data-hospital="SGH"] [data-testid=band]')).toHaveCount(0);   // fewer than 3 full EDs report
    await expect(page.getByTestId("pinned-caveat")).toHaveCount(0);
  });

  test("the dumbbell: SGH's latest week against its usual level, with the unusual-week finding pointed out", async ({ page }) => {
    await page.goto("/ed-trends");
    const rows = page.getByTestId("dumbbell-row");
    await expect(rows).toHaveCount(1);
    const sgh = rows.first();
    await expect(sgh).toHaveAttribute("data-annotated", "");
    await expect(sgh.getByTestId("delta-number")).toContainText("+25%");
    await expect(sgh.getByTestId("delta-change")).toContainText("▲ higher than usual");
    await expect(sgh.getByTestId("delta-change")).toHaveClass(/text-bad/);                      // a longer wait is worse
    await expect(sgh.getByTestId("chart-callout")).toContainText("19–25 Oct 2026: 5.0 hours");
    expect(await plain(page.getByTestId("dumbbell-missing"))).toContain("(7 of 8)");
  });

  test("the weekday heatmap's colour scale is centred on 0, with the peak-day finding marked", async ({ page }) => {
    await page.goto("/ed-trends");
    const legend = page.getByTestId("heat-legend");
    const [min, max] = [Number(await legend.getAttribute("data-min")), Number(await legend.getAttribute("data-max"))];
    expect(min).toBe(-max);
    const classes = page.getByTestId("heat-legend-class");
    await expect(classes).toHaveCount(7);
    await expect(classes.nth(3)).toContainText("0%");
    const middle = [Number(await classes.nth(3).getAttribute("data-min")), Number(await classes.nth(3).getAttribute("data-max"))];
    expect(middle[0]! + middle[1]!).toBeCloseTo(0, 10);                                         // the middle class straddles 0
    const zero = page.locator('[data-testid=heat-cell][data-value="0.00"]').first();
    await expect(zero).toHaveAttribute("data-color", "#F7F7F7");                                 // 0 is the neutral colour
    await expect(page.locator("[data-testid=heat-cell][data-annotated]")).toHaveCount(1);
    await expect(page.getByTestId("chart-card").filter({ hasText: "Bed wait by day of the week" }).getByTestId("chart-callout"))
      .toContainText("Mondays: 25% above average");
  });

  test("the comparison toggle shows raw values, pinning the UCC and adults-only caveats", async ({ page }) => {
    await page.goto("/ed-trends?hospital=AH&hospital=NUH&hospital=SGH");
    await page.getByRole("link", { name: "Raw values across hospitals" }).click();
    await expect(page).toHaveURL(/hospital=AH&hospital=NUH&hospital=SGH&mode=raw/);
    const pinned = page.getByTestId("small-multiples").getByTestId("pinned-caveat");
    await expect(pinned).toHaveCount(2);
    expect(await plain(pinned.first())).toMatch(/not a full .*so its waits are shorter/);
    expect(await plain(pinned.nth(1))).toMatch(/^i ?Adults only/);
    await expect(page.getByTestId("dumbbell-row").first().getByTestId("delta-number")).toContainText(/5\.0 hours\s*vs 4\.0 usual/);
    await expect(page.locator('[data-testid=multiple][data-hospital="AH"] [data-testid=series]')).not.toHaveCount(0);
    await page.getByRole("link", { name: "Each against its own usual level" }).click();
    await expect(page).not.toHaveURL(/mode=raw/);
  });

  test("the NUHS and MOH slope chart says the days and measures differ", async ({ page }) => {
    await page.goto("/ed-trends");
    await expect(page.getByTestId("slope")).not.toHaveCount(0);
    expect(await plain(page.getByTestId("slope-caveat"))).toMatch(/^Different days and different measures/);
    // Each source's own date and badge, not MOH's date for NUHS's figures (audit H-1).
    const card = page.getByTestId("chart-card").filter({ has: page.getByTestId("slope-chart") });
    expect(await plain(card.getByTestId("provenance-line"))).toMatch(
      /^Data as of 1 Nov 2026, 12:01 pm SGT \(NUHS\) and 31 Oct 2026 \(MOH\) · Source:/);
    await expect(card.getByText(/^NUHS: /)).toBeVisible();
    await expect(card.getByText(/^MOH: /)).toBeVisible();
    // Only bounded readings ("< 1 hour") are named under the chart; this fixture's bed waits are values.
    await expect(page.getByTestId("slope-bounded")).toHaveCount(0);
  });

  test("the weekday table names only chosen hospitals it can't show (audit L-3)", async ({ page }) => {
    await page.goto("/ed-trends?hospital=SGH");
    const heat = page.getByTestId("chart-card").filter({ has: page.getByTestId("heatmap") });
    await expect(heat).toBeVisible();
    await expect(heat.getByText(/^Not shown, with fewer than 4 complete weeks/)).toHaveCount(0);   // NUH etc. weren't chosen
  });

  test("filters by hospital through the form, keeping the URL shareable", async ({ page }) => {
    await page.goto("/ed-trends");
    await page.getByRole("checkbox", { name: /Alexandra Hospital/ }).uncheck();
    await page.getByRole("checkbox", { name: /National University Hospital/ }).uncheck();
    await page.getByRole("button", { name: "Show" }).click();
    await expect(page).toHaveURL(/hospital=SGH/);
    await expect(page.getByTestId("multiple")).toHaveCount(1);
  });

  test("a hospital with no figures gets an empty state, not a flat line", async ({ page }) => {
    await page.goto("/ed-trends?hospital=NUH");
    expect(await seen(page.locator("main"))).toContain("No MOH figures for this selection");
    await expect(page.getByTestId("chart-card")).toHaveCount(0);
  });

  test("a range over 2 years shows the API's reason", async ({ page }) => {
    await page.goto("/ed-trends?from=2023-01-01&to=2026-10-31");
    const alert = page.getByRole("alert").filter({ hasText: "These dates can't be shown" });
    await expect(alert).toBeVisible();
    await expect(alert).toContainText("Choose dates no more than 2 years apart.");
    await expect(alert).toContainText("Reference: range_too_long");
  });

  test("ignores an unknown hospital code and says so", async ({ page }) => {
    await page.goto("/ed-trends?hospital=XYZ&hospital=SGH");
    await expect(page.getByText("Ignored unknown hospital code: XYZ.")).toBeVisible();
  });

  for (const path of ["/ed-trends", "/ed-trends?mode=raw"]) {
    test(`passes axe WCAG 2.1 AA checks (${path})`, async ({ page }) => {
      await page.goto(path);
      await expectNoA11yViolations(page);
    });
  }
});
