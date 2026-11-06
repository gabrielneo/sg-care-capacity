import { expect, test } from "@playwright/test";

import { expectAsOfOnEveryCard, expectNoA11yViolations, expectNoHorizontalScroll } from "./helpers";

test.describe("Live", () => {
  test("labels each reading as a NUHS estimate with its own time", async ({ page }) => {
    await page.goto("/live");
    await expect(page.getByText("Estimates from the NUHS public page, not live and not MOH statistics")).toBeVisible();
    const labels = page.getByTestId("reading-label");
    await expect(labels).toHaveCount(4);
    const card = (title: RegExp) => page.getByTestId("chart-card").filter({ has: page.getByRole("heading", { name: title }) });
    const nuh = card(/^National University Hospital: Adult Emergency$/);
    await expect(nuh.getByTestId("reading-label")).toHaveText("Estimate from NUHS public page, at 1 Nov 2026, 12:01 pm SGT");
    await expect(nuh).toContainText("18");
    await expect(nuh).toContainText("20 hours");
    const ntfgh = card(/^Ng Teng Fong General Hospital/);
    await expect(ntfgh.getByTestId("reading-label")).toHaveText("Estimate from NUHS public page, at 31 Oct 2026, 8:00 pm SGT");
    await expect(card(/Children's Emergency$/)).toContainText("not part of MOH's NUH figures");
    await expect(card(/^National University Hospital: Adult Emergency$/)).not.toContainText("not part of MOH's NUH figures");
    await expectAsOfOnEveryCard(page, 4);
    await expectNoHorizontalScroll(page);
  });

  test("passes axe WCAG 2.1 AA checks", async ({ page }) => {
    await page.goto("/live");
    await expectNoA11yViolations(page);
  });
});
