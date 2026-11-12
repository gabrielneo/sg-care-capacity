import { expect, test } from "@playwright/test";

import { blockTiles, expectNoA11yViolations, expectNoHorizontalScroll } from "./helpers";

/*
 * The public finder on the API's fixture snapshot (api/tests/fixture_snapshot.py): clinics in Bedok
 * (postcodes 4600xx; Echo Clinic is inactive), one in Tuas, polyclinics in Bedok and Woodlands, and
 * 3 hospitals: SGH (+25%, "busier than usual"), AH (urgent care centre, NUHS estimate) and NUH (adults only, no MOH rows).
 */
// The NUHS estimate's own line also has a time: "Data as of 1 Nov 2026, 12:01 pm SGT".
const AS_OF = /^Data as of \d{1,2} [A-Z][a-z]{2,3} \d{4}(, .+)? · Source: .+/;

test.beforeEach(async ({ page }) => blockTiles(page));

test.describe("Public finder", () => {
  test("a postcode lists places nearest first, with straight-line distances and a Nearest badge", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (r) => requests.push(r.url()));
    await page.goto("/");
    await page.getByLabel("Your postcode or area").fill("460002");
    await page.getByRole("button", { name: "Find clinics" }).click();

    const nearby = page.getByTestId("nearby");
    await expect(nearby.getByRole("heading", { level: 2 })).toHaveText("Near 460002");
    await expect(page).toHaveURL(/\/#near=460002$/);
    await expect(nearby.getByTestId("nearby-basis")).toContainText("Distances from that postcode, in a straight line.");

    const cards = nearby.getByTestId("nearby-place");
    await expect(cards.first()).toContainText("Bravo Clinic");
    await expect(cards.first().getByTestId("nearby-km")).toHaveText("under 0.1 km");
    await expect(cards.first().getByTestId("nearest-badge")).toHaveText(/Nearest/);
    await expect(nearby.getByTestId("nearest-badge")).toHaveCount(1);
    await expect(nearby.getByText("Echo Clinic")).toHaveCount(0);                              // inactive
    await expect(cards.first()).toContainText("straight-line distance");

    // Sorted by distance, whatever the kind.
    const km = await cards.evaluateAll((els) => els.map((e) => e.querySelector('[data-testid="nearby-km"]')!.textContent!));
    const value = (t: string) => (t.startsWith("under") ? 0 : parseFloat(t));
    for (let i = 1; i < km.length; i++) expect(value(km[i]!)).toBeGreaterThanOrEqual(value(km[i - 1]!));
    expect(await cards.evaluateAll((els) => els.map((e) => e.getAttribute("data-type")))).toContain("polyclinic");

    // Directions: an external map link with the place's coordinates, no search text, no routing claims.
    const dir = cards.first().getByTestId("directions");
    await expect(dir).toHaveAttribute("href", /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=[\d.]+,[\d.]+$/);
    await expect(dir).toHaveAttribute("target", "_blank");
    await expect(page.locator("body")).not.toContainText(/fastest|travel time|\bETA\b/i);
    for (const line of await nearby.getByTestId("provenance-line").all()) await expect(line).toHaveText(AS_OF);

    // Nothing the person typed was sent to any server.
    expect(requests.filter((u) => u.includes("460002"))).toEqual([]);
  });

  test("the type filter narrows the list and is announced", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Your postcode or area").fill("460002");
    await page.getByRole("button", { name: "Find clinics" }).click();
    await expect(page.getByTestId("nearby-place").first()).toBeVisible();
    await expect(page.getByTestId("live-region")).toHaveText(/^\d+ places near 460002\. Nearest: Bravo Clinic, under 0\.1 km in a straight line\.$/);

    await page.getByTestId("type-filter").getByText("Polyclinics", { exact: true }).click();
    await expect(page.getByTestId("nearby-place")).toHaveCount(2);                              // Bedok and Woodlands
    await expect(page.getByTestId("nearby-place").first()).toContainText("Bedok Polyclinic");
    await expect(page.getByTestId("live-region")).toHaveText(/^2 polyclinics near 460002\./);
    await expect(page).toHaveURL(/#near=460002&type=polyclinic$/);

    await page.getByTestId("type-filter").getByText("GP clinics", { exact: true }).click();
    for (const type of await page.getByTestId("nearby-place").evaluateAll((els) => els.map((e) => e.getAttribute("data-type")))) expect(type).toBe("gp");
    // Open hours and a CHAS filter don't exist in the data, so there is no such control.
    await expect(page.getByTestId("type-filter").getByRole("radio")).toHaveCount(3);
  });

  test("the three nearest EDs show plain badges, the full bed-wait label and the NUHS estimate where there is one", async ({ page }) => {
    await page.goto("/#near=460002");
    const list = page.getByTestId("ed-list");
    await expect(page.getByTestId("ed-item")).toHaveCount(3);
    await expect(page.getByRole("heading", { level: 2, name: /^How busy were (Emergency Departments \(EDs\)|EDs) near you last week\?$/ })).toBeVisible();
    for (const km of await list.getByTestId("ed-km").allTextContents()) expect(km).toMatch(/km straight-line distance$/);

    const card = (code: string) => page.locator(`[data-testid=ed-card][data-hospital="${code}"]`);
    await expect(card("SGH").getByTestId("status-badge")).toHaveText("▲Busier than usual for this hospital");
    await expect(card("SGH").getByTestId("ed-label")).toHaveText("Time waiting for a ward bed after the decision to admit");
    await expect(card("SGH").getByTestId("ed-hours")).toHaveText("5.0 hours");
    await expect(card("SGH").getByTestId("ed-live")).toHaveCount(0);                            // no NUHS estimate for SGH

    // Missing stays missing, and what MOH's figures cover stays on the card.
    await expect(card("AH").getByTestId("status-badge")).toHaveText("–No comparison with usual available");
    await expect(card("AH").getByTestId("ed-note")).toHaveText("Urgent care centre");
    await expect(card("AH").getByTestId("ed-live")).toContainText(/To see a doctor \((National University Health System \()?NUHS\)? estimate\): under 1 hour/);
    await expect(card("AH").getByTestId("ed-live")).toContainText(/As of .*\d{4}.* An estimate, not live\./);
    await expect(card("NUH").getByTestId("ed-hours")).toHaveText("–");
    await expect(card("NUH").getByTestId("ed-note")).toHaveText("Adults only");

    // "Wait time" never stands alone, anywhere on the page.
    expect(await page.getByTestId("ed-near").innerText()).not.toMatch(/wait time/i);
    await expect(page.getByTestId("status-exclusions")).toContainText("Children's Emergency");
    for (const line of await page.getByTestId("ed-near").getByTestId("provenance-line").all()) await expect(line).toHaveText(AS_OF);
    await expect(page.getByTestId("ed-near").getByRole("link", { name: /Analyst detail/ })).toHaveAttribute("href", "/?view=analyst");
  });

  test("the bed-wait help opens on keyboard focus, explains it isn't time to see a doctor, and closes on Escape", async ({ page }) => {
    await page.goto("/#near=460002");
    const help = page.locator('[data-testid=ed-card][data-hospital="SGH"]').getByRole("button", { name: "What does this wait mean?" });
    await help.focus();
    const tip = page.locator('[data-testid=ed-card][data-hospital="SGH"]').getByRole("tooltip");
    await expect(tip).toBeVisible();
    await expect(tip).toContainText("Not the time to see a doctor.");
    await page.keyboard.press("Escape");
    await expect(tip).toBeHidden();
    const box = (await help.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  });

  test("an area name works, and a postcode it can't place says how to recover", async ({ page }) => {
    await page.goto("/#near=bedok");
    await expect(page.getByTestId("nearby").getByRole("heading", { level: 2 })).toHaveText("Near Bedok");
    await expect(page.getByTestId("nearby-basis")).toContainText("approximate");

    await page.getByLabel("Your postcode or area").fill("4600");
    await page.getByRole("button", { name: "Find clinics" }).click();
    await expect(page.getByTestId("nearby-message")).toHaveText("Singapore postcodes have 6 digits. Check the number and try again.");
    await expect(page.getByTestId("live-region")).toHaveText(/6 digits/);
    await page.getByLabel("Your postcode or area").fill("990000");
    await page.getByRole("button", { name: "Find clinics" }).click();
    await expect(page.getByTestId("nearby-message")).toContainText("Try a nearby postcode");
    await expect(page.getByTestId("ed-prompt")).toBeVisible();                                  // no EDs without a place
  });

  test("a shared link opens the search, and back and forward follow it", async ({ page }) => {
    await page.goto("/#near=460002");
    await expect(page.getByTestId("nearby").getByRole("heading", { level: 2 })).toHaveText("Near 460002");
    await page.getByLabel("Your postcode or area").fill("bedok");
    await page.getByRole("button", { name: "Find clinics" }).click();
    await expect(page.getByTestId("nearby").getByRole("heading", { level: 2 })).toHaveText("Near Bedok");
    await page.goBack();
    await expect(page.getByTestId("nearby").getByRole("heading", { level: 2 })).toHaveText("Near 460002");
    await expect(page.getByLabel("Your postcode or area")).toHaveValue("460002");
  });

  test("fully usable by keyboard, with 16px body text and 44px targets", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Your postcode or area").focus();
    await page.keyboard.type("460002");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("nearby-place").first()).toBeVisible();
    for (const target of [page.getByLabel("Your postcode or area"), page.getByRole("button", { name: "Find clinics" }),
      page.getByTestId("type-filter").locator("label").first(), page.getByTestId("directions").first(), page.getByRole("link", { name: "Call 995" })]) {
      const box = (await target.boundingBox())!;
      expect(box.height, "target height").toBeGreaterThanOrEqual(44);
    }
    // Body text on the cards is at least 16px; meta lines at least 14px.
    for (const id of ["place-type", "place-address", "ed-label", "ed-sentence"]) {
      const size = await page.getByTestId(id).first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      expect(size, id).toBeGreaterThanOrEqual(16);
    }
    const small = await page.getByTestId("ed-near").getByTestId("provenance-line").first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(small).toBeGreaterThanOrEqual(14);
  });

  test("no sideways scrolling, and passes axe (WCAG 2.2 AA), before and after a search", async ({ page }) => {
    await page.goto("/");
    await expectNoHorizontalScroll(page);
    await expectNoA11yViolations(page, { wcag22: true });
    await page.goto("/#near=460002");
    await expect(page.getByTestId("ed-item")).toHaveCount(3);
    await expectNoHorizontalScroll(page);
    await expectNoA11yViolations(page, { wcag22: true });
  });

  test("fits a 768 px tablet", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/#near=460002");
    await expect(page.getByTestId("ed-item")).toHaveCount(3);
    await expectNoHorizontalScroll(page);
    await expectNoA11yViolations(page, { wcag22: true });
  });
});
