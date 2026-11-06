import { expect, test } from "@playwright/test";

import { expectAsOfOnEveryCard, expectNoA11yViolations, expectNoHorizontalScroll, seen } from "./helpers";

test.describe("Live", () => {
  test("labels each reading as a NUHS estimate with its own time", async ({ page }) => {
    await page.goto("/live");
    expect(await seen(page.getByRole("note"))).toContain("Estimates from the NUHS public page, not live and not Ministry of Health (MOH) statistics");
    const labels = page.getByTestId("reading-label");
    await expect(labels).toHaveCount(4);
    const card = (title: RegExp) => page.getByTestId("chart-card").filter({ has: page.getByRole("heading", { name: title }) });
    const nuh = card(/^National University Hospital: Adult Emergency$/);
    expect(await seen(nuh.getByTestId("reading-label"))).toBe("Estimate from NUHS public page, at 1 Nov 2026, 12:01 pm SGT");
    await expect(nuh).toContainText("18");
    await expect(nuh).toContainText("20 hours");
    const ntfgh = card(/^Ng Teng Fong General Hospital/);
    expect(await seen(ntfgh.getByTestId("reading-label"))).toBe("Estimate from NUHS public page, at 31 Oct 2026, 8:00 pm SGT");
    // NUH is first named on this page in the children's card, so it is spelled out there.
    expect(await seen(card(/Children's Emergency$/))).toContain("Children's emergency is not part of MOH's National University Hospital (NUH) figures");
    expect(await seen(card(/^National University Hospital: Adult Emergency$/))).not.toContain("not part of MOH's NUH figures");
    await expectAsOfOnEveryCard(page, 4);
    await expectNoHorizontalScroll(page);
  });

  test("passes axe WCAG 2.1 AA checks", async ({ page }) => {
    await page.goto("/live");
    await expectNoA11yViolations(page);
  });
});
