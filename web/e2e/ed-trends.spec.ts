import { expect, type Locator, test } from "@playwright/test";

import { expectProvenanceOnEveryFrame, expectNoA11yViolations, expectNoHorizontalScroll, seen } from "./helpers";

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
    // Each title states its window in words (audit A4).
    for (const title of [/^Time waiting for a ward bed after the decision to admit, \d{1,2} \w{3} \d{4} to \d{1,2} \w{3} \d{4}$/,
                         /^The latest complete week \(.+\) vs usual \(previous 8 complete weeks\)$/,
                         /^Bed wait by day of the week, last 26 weeks$/]) {
      await expect(page.getByRole("heading", { level: 2, name: title })).toBeVisible();
    }
    await expect(page.getByRole("heading", { level: 2, name: /estimate and .*figure/ })).toBeVisible();
    expect(await seen(page.getByTestId("bed-wait-explainer"))).toBe(
      "This is not the time to see a doctor. It measures how long admitted patients wait in the ED for a ward bed. "
      + "A week's figure averages its daily medians, because MOH publishes only daily medians and a weekly median can't be rebuilt from them.");
    expect(await seen(page.getByTestId("gap-summary"))).toBe("Days with no figure in this range: AH 21, NUH 90, SGH 21.");
    await expectProvenanceOnEveryFrame(page, 4);
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
    await expect(sgh.getByTestId("delta-change")).toHaveClass(/text-status-much/);                      // a longer wait is worse
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
    await expect(classes.nth(3)).toContainText(/−[\d.]+ to \+[\d.]+%/);                   // the middle class: "−9 to +9%"
    const middle = [Number(await classes.nth(3).getAttribute("data-min")), Number(await classes.nth(3).getAttribute("data-max"))];
    expect(middle[0]! + middle[1]!).toBeCloseTo(0, 10);                                         // the middle class straddles 0
    const zero = page.locator('[data-testid=heat-cell][data-value="0.00"]').first();
    await expect(zero).toHaveAttribute("data-color", "#EFEAE1");                                 // 0 is the neutral colour
    await expect(page.locator("[data-testid=heat-cell][data-annotated]")).toHaveCount(1);
    await expect(page.getByTestId("chart-frame").filter({ hasText: "Bed wait by day of the week" }).getByTestId("chart-callout"))
      .toContainText("Mondays: 25% above average");
  });

  test("marks public holidays inside the range, with their source and date, from the API's event list", async ({ page, request }) => {
    const body = await (await request.get("http://127.0.0.1:8791/api/v1/events?from=2026-08-24&to=2026-10-31")).json() as
      { data: { event_date: string; label: string }[] };
    await page.goto("/ed-trends");
    const key = page.getByTestId("annotation-key");
    await expect(key).toBeVisible();
    for (const e of body.data) await expect(key).toContainText(e.label);
    await expect(key).toContainText("Deepavali");
    await expect(key).not.toContainText("Christmas");                                       // outside the range: not pinned to an edge
    expect(await plain(page.getByTestId("annotation-source"))).toMatch(/^Marked days: .*Public Holidays.*data as of 3 Jul 2026\.$/);
    await expect(page.getByTestId("annotation-rule")).not.toHaveCount(0);
  });

  test("the comparison toggle shows raw values, pinning the UCC and adults-only caveats", async ({ page }) => {
    await page.goto("/ed-trends?hospital=AH&hospital=NUH&hospital=SGH");
    await page.getByRole("link", { name: "Raw values across hospitals" }).click();
    await expect(page).toHaveURL(/hospital=AH&hospital=NUH&hospital=SGH&mode=raw/);
    const pinned = page.getByTestId("small-multiples").getByTestId("pinned-caveat");
    await expect(pinned).toHaveCount(2);
    // The EDs' panels first, the urgent care centre's last (ADR 0012).
    expect(await plain(pinned.first())).toMatch(/^Adults only/);
    expect(await plain(pinned.nth(1))).toMatch(/not a full .*so its waits are shorter/);
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
    const card = page.getByTestId("chart-frame").filter({ has: page.getByTestId("slope-chart") });
    expect(await plain(card.getByTestId("provenance-line"))).toMatch(
      /^Data as of 1 Nov 2026, 12:01 pm SGT \(NUHS\) and 31 Oct 2026 \(MOH\) · Source:/);
    await expect(card.getByText(/^NUHS: /)).toBeVisible();
    await expect(card.getByText(/^MOH: /)).toBeVisible();
    // Only bounded readings ("< 1 hour") are named under the chart; this fixture's bed waits are values.
    await expect(page.getByTestId("slope-bounded")).toHaveCount(0);
  });

  test("the weekday table names only chosen hospitals it can't show (audit L-3)", async ({ page }) => {
    await page.goto("/ed-trends?hospital=SGH");
    const heat = page.getByTestId("chart-frame").filter({ has: page.getByTestId("heatmap") });
    await expect(heat).toBeVisible();
    await expect(heat.getByText(/^Not shown, with fewer than 4 complete weeks/)).toHaveCount(0);   // NUH etc. weren't chosen
  });

  test("filters by hospital through the form, keeping the URL shareable", async ({ page }) => {
    await page.goto("/ed-trends");
    // Below 768px the form is folded behind one line (review N12): open it first.
    if ((page.viewportSize()?.width ?? 0) < 768) await page.getByTestId("ed-filters-toggle").locator("summary").click();
    await page.getByRole("checkbox", { name: /Alexandra Hospital/ }).uncheck();
    await page.getByRole("checkbox", { name: /National University Hospital/ }).uncheck();
    await page.getByRole("button", { name: "Show" }).click();
    await expect(page).toHaveURL(/hospital=SGH/);
    await expect(page.getByTestId("multiple")).toHaveCount(1);
  });

  test("a hospital with no figures gets an empty state, not a flat line", async ({ page }) => {
    await page.goto("/ed-trends?hospital=NUH");
    expect(await seen(page.locator("main"))).toContain("No MOH figures for this selection");
    await expect(page.getByTestId("chart-frame")).toHaveCount(0);
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

  test("callouts sit above the charts: each with strength, as-of, source and a link to Findings; never more than two", async ({ page }) => {
    await page.goto("/ed-trends");
    const callouts = page.getByTestId("callouts");
    await expect(callouts.first()).toBeVisible();
    for (const c of await page.getByTestId("callout").all()) {
      await expect(c.getByTestId("callout-strength")).toContainText(/[○◔◑●] Strength: (weak|moderate|strong)/);
      await expect(c.getByTestId("callout-provenance")).toContainText(/Data as of \d{1,2} [A-Z][a-z]{2} \d{4} \(MOH\)/);
      await expect(c.getByRole("link", { name: "Read the finding" })).toHaveAttribute("href", /^\/findings#/);
    }
    for (const section of await callouts.all()) {
      expect(await section.locator(":scope > ul > li").count()).toBeLessThanOrEqual(2);
    }
    const text = await page.locator('[data-testid=callouts]').allInnerTexts();
    expect(text.join(" ")).not.toMatch(/due to|caused/i);
    // The finding about visits and waits is an association, and says so.
    await expect(page.getByTestId("callout").filter({ hasText: "move" }).first()).toContainText("does not show why waits move");
    await expectNoHorizontalScroll(page);
    await page.screenshot({ path: `test-results/callouts-${page.viewportSize()!.width}.png`, fullPage: true });
  });

  for (const path of ["/ed-trends", "/ed-trends?mode=raw"]) {
    test(`passes axe WCAG 2.1 AA checks (${path})`, async ({ page }) => {
      await page.goto(path);
      await expectNoA11yViolations(page);
    });
  }
});

test.describe("ED trends on a phone (review N12)", () => {
  test("the filters fold behind one line that says what is shown, and open in place; from 768px they are always open", async ({ page }) => {
    await page.goto("/ed-trends");
    const form = page.getByTestId("ed-filters").locator("form");
    const toggle = page.getByTestId("ed-filters-toggle");
    if ((page.viewportSize()?.width ?? 0) < 768) {
      await expect(form).toBeHidden();
      await expect(page.getByTestId("ed-filters-current")).toHaveText(/^All 3 hospitals, \d{1,2} [A-Z][a-z]{2,3} \d{4} to \d{1,2} [A-Z][a-z]{2,3} \d{4}$/);
      await toggle.locator("summary").click();
      await expect(form).toBeVisible();
      await expect(toggle.locator("summary")).toContainText("Hide hospitals and dates");
    } else {
      await expect(toggle).toBeHidden();
      await expect(form).toBeVisible();
    }
  });

  test("nothing moves after load: the fold is CSS, not script", async ({ page }) => {
    await page.goto("/ed-trends", { waitUntil: "networkidle" });
    const shift = await page.evaluate(() => new Promise<number>((done) => {
      let total = 0;
      new PerformanceObserver((l) => { for (const e of l.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!e.hadRecentInput) total += e.value; })
        .observe({ type: "layout-shift", buffered: true });
      setTimeout(() => done(total), 500);
    }));
    expect(shift).toBeLessThan(0.01);
  });
});
