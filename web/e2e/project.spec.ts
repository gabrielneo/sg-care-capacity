import { expect, test } from "@playwright/test";

import { DOWN, expectNoA11yViolations, expectNoHorizontalScroll } from "./helpers";

const API = "http://127.0.0.1:8791/api/v1";

test.describe("The project page", () => {
  test("names the author, links the CV, and shows the API's headline findings", async ({ page, request }) => {
    const headline = await (await request.get(`${API}/insights?headline=true`)).json() as
      { data: { headline_rank: number | null; display: { value_text: string } | null; chart: unknown }[] };
    const expected = headline.data.filter((i) => i.headline_rank != null && i.display && i.chart).slice(0, 3);

    await page.goto("/project");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("I built a weekly, checked view");
    await expect(page.getByTestId("project")).toContainText("by Gabriel Neo");
    await expect(page.getByRole("link", { name: /Connect on LinkedIn/ })).toHaveAttribute("href", /linkedin\.com/);
    await expect(page.getByTestId("project-what-i-did").getByRole("listitem")).toHaveCount(3);
    await expect(page.getByRole("link", { name: /Read my CV/ })).toHaveAttribute("href", /docs\.google\.com/);

    const tiles = page.getByTestId("project-finding");
    await expect(tiles).toHaveCount(expected.length);
    for (const [i, f] of expected.entries()) await expect(tiles.nth(i)).toContainText(f.display!.value_text);
  });

  test("the checks tile counts the latest run's passes out of its results", async ({ page, request }) => {
    const q = await (await request.get(`${API}/quality`)).json() as { data: { results: { status: string }[] } };
    const passed = q.data.results.filter((r) => r.status === "pass").length;
    await page.goto("/project");
    await expect(page.getByTestId("project-checks")).toHaveText(`${passed}/${q.data.results.length}`);
  });

  test("says what the checks that didn't pass are, from the same run, and links to every check", async ({ page, request }) => {
    const q = await (await request.get(`${API}/quality`)).json() as
      { data: { blocking: number; results: { status: string; severity: string }[] } };
    const warn = q.data.results.filter((r) => r.status === "fail" && r.severity !== "ERROR").length;
    const skipped = q.data.results.filter((r) => r.status === "skipped").length;
    await page.goto("/project");
    const note = page.getByTestId("project-checks-note");
    if (warn) await expect(note).toContainText(`${warn} warning`);
    if (skipped) await expect(note).toContainText(`${skipped} skipped`);
    await expect(note).toContainText(q.data.blocking === 0 ? "none blocks publishing" : "publishing");
    await expect(note.getByRole("link", { name: "See every check" })).toHaveAttribute("href", "/data-quality");
  });

  test("shows a live piece of the site, with its date and source", async ({ page }) => {
    await page.goto("/project");
    const live = page.getByTestId("project-live");
    await expect(live.getByTestId("hero-line")).toBeVisible();
    await expect(live).toContainText(/Data as of .+ · Source: /);
  });

  test("is reached from the footer's About column and from the About page, and the footer credits the author", async ({ page }) => {
    await page.goto("/methodology");
    await expect(page.getByTestId("footer-credits")).toContainText("Built by Gabriel Neo");
    await page.locator("footer").getByRole("link", { name: "The project in 60 seconds" }).click();
    await expect(page).toHaveURL(/\/project$/);
    await page.goto("/about");
    await page.getByTestId("hub").getByRole("link", { name: /The project/ }).click();
    await expect(page).toHaveURL(/\/project$/);
  });

  test("the case study points short on time readers to it, with the byline", async ({ page }) => {
    await page.goto("/case-study");
    const glance = page.getByTestId("case-study-glance");
    await expect(glance.getByRole("link", { name: "The project page" })).toHaveAttribute("href", "/project");
    await expect(glance.getByTestId("author-byline")).toContainText("Gabriel Neo");
    await expect(glance).toContainText(/\d+ minutes to read/);
  });

  test("no product view has the CV or LinkedIn line (E2): it lives in the footer and on /about", async ({ page }) => {
    for (const path of ["/find"]) {
      await page.goto(path);
      await expect(page.getByTestId("home")).not.toContainText("Here from a CV or LinkedIn");
      await expect(page.getByTestId("project-link")).toHaveCount(0);
      await expect(page.getByRole("link", { name: "See the project in 60 seconds" })).toHaveCount(0);
      await expect(page.locator("footer").getByRole("link", { name: "The project in 60 seconds" })).toHaveAttribute("href", "/project");
    }
    await page.goto("/about");
    const author = page.getByTestId("about-author");
    await expect(author).toContainText("Gabriel Neo");
    await expect(author.getByRole("link", { name: /Read the CV/ })).toHaveAttribute("href", /docs\.google\.com/);
    // About doesn't repeat /project's "what I did" lines; the author card comes first, above the three cards.
    await expect(page.getByTestId("project-what-i-did")).toHaveCount(0);
    const [card, hub] = await Promise.all([author.boundingBox(), page.getByTestId("hub").locator(".card-grid").boundingBox()]);
    expect(card!.y).toBeLessThan(hub!.y);
    await expect(page.getByTestId("hub").locator(".card-grid li")).toHaveCount(3);
  });

  test("findings say why their hours can sit above the case study's typical waits", async ({ page }) => {
    await page.goto("/findings");
    await expect(page.getByTestId("average-vs-typical")).toContainText("A few very long days pull an average up");
  });

  test("fits the screen and passes the accessibility checks", async ({ page }) => {
    await page.goto("/project");
    await expectNoHorizontalScroll(page);
    await expectNoA11yViolations(page, { wcag22: true });
  });

  test("says so when the API is down, without inventing figures", async ({ page }) => {
    await page.goto(`${DOWN}/project`);
    await expect(page.getByTestId("project-finding")).toHaveCount(0);
    await expect(page.getByTestId("project-checks")).toHaveText("–not available");
    await expectNoHorizontalScroll(page);
  });
});
