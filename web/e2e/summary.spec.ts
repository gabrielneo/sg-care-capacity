import { expect, test } from "@playwright/test";

import { expectNoA11yViolations, expectNoHorizontalScroll, seen } from "./helpers";

/** Requirement S4: a printable one-page summary of the latest findings. */

const API = "http://127.0.0.1:8791/api/v1";

test.describe("One-page summary", () => {
  test("shows the API's top findings, priority areas and limits, each with its date and source", async ({ page, request }) => {
    const headline = await (await request.get(`${API}/insights?headline=true`)).json() as
      { data: { headline: string; headline_rank: number | null }[]; meta: { snapshot_id: string } };
    const gaps = await (await request.get(`${API}/insights?type=access_gap&top=5`)).json() as { data: { entity: string }[] };

    await page.goto("/summary");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Right-siting care in a super-aged Singapore");
    await expect(page.getByTestId("summary-release")).toContainText(`weekly data release ${headline.meta.snapshot_id}`);

    const findings = page.getByTestId("summary-finding");
    const expected = headline.data.filter((i) => i.headline_rank != null).slice(0, 3);
    await expect(findings).toHaveCount(expected.length);
    // The glossary spells out an abbreviation on first use: "Emergency Department (ED)" reads as "ED" here.
    const unspelled = (t: string) => t.replace(/(?:[A-Z][a-z]+ )+\(([A-Z]{2,})\)/g, "$1");
    for (const [i, f] of expected.entries()) expect(unspelled(await seen(findings.nth(i)))).toContain(f.headline);
    for (const f of await findings.all()) await expect(f.getByTestId("summary-metric")).not.toBeEmpty();   // what the number measures
    for (const f of await findings.all()) await expect(f).toContainText(/Uses data to \d{1,2} [A-Z][a-z]{2} \d{4}\./);

    await expect(page.getByTestId("summary-area").locator("th")).toHaveText(gaps.data.map((g) => g.entity).slice(0, 5));
    await expect(page.getByTestId("summary-limits").locator("li")).toHaveCount(3);
    // One "Data as of … · Source:" line for each block of figures: population, findings, areas.
    await expect(page.getByTestId("provenance-line")).toHaveCount(3);
    for (const line of await page.getByTestId("provenance-line").all()) await expect(line).toContainText("Source:");

    await expectNoHorizontalScroll(page);
    await expectNoA11yViolations(page);
  });

  test("the Findings page links to it", async ({ page }) => {
    await page.goto("/findings");
    await page.getByTestId("summary-link").click();
    await expect(page).toHaveURL(/\/summary$/);
  });

  test("prints on exactly one A4 page, without the site's header, nav, footer or print button", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "page.pdf is Chromium-only");
    await page.goto("/summary");
    await expect(page.getByTestId("print-button")).toBeVisible();
    await page.emulateMedia({ media: "print" });
    for (const hidden of ["body > header", "body > footer", "[data-testid=print-button]"]) {
      await expect(page.locator(hidden)).toBeHidden();
    }
    await expect(page.getByTestId("summary-findings")).toBeVisible();
    const pdf = (await page.pdf({ preferCSSPageSize: true, printBackground: true })).toString("latin1");
    expect(pdf.match(/\/Type\s*\/Page(?!s)/g)).toHaveLength(1);
  });
});
