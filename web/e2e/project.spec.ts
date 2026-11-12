import { expect, test } from "@playwright/test";

import { DOWN, expectNoA11yViolations, expectNoHorizontalScroll } from "./helpers";

const API = "http://127.0.0.1:8791/api/v1";

test.describe("The project page", () => {
  test("names the author, links the CV, and shows the API's headline findings", async ({ page, request }) => {
    const headline = await (await request.get(`${API}/insights?headline=true`)).json() as
      { data: { headline_rank: number | null; display: { value_text: string } | null; chart: unknown }[] };
    const expected = headline.data.filter((i) => i.headline_rank != null && i.display && i.chart).slice(0, 3);

    await page.goto("/project");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Singapore is ageing fast");
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

  test("has the byline in the footer of other pages, and a nav link", async ({ page }) => {
    await page.goto("/methodology");
    await expect(page.locator("footer").getByTestId("author-byline")).toContainText("Gabriel Neo");
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "The project" }).click();
    await expect(page).toHaveURL(/\/project$/);
  });

  test("the case study points short on time readers to it, with the byline", async ({ page }) => {
    await page.goto("/case-study");
    const glance = page.getByTestId("case-study-glance");
    await expect(glance.getByRole("link", { name: "The project page" })).toHaveAttribute("href", "/project");
    await expect(glance.getByTestId("author-byline")).toContainText("Gabriel Neo");
    await expect(glance).toContainText(/\d+ minutes to read/);
  });

  test("the home page points CV and LinkedIn visitors to it, after the emergency line", async ({ page }) => {
    const phone = page.viewportSize()!.width < 640;
    for (const path of ["/", "/?view=planner"]) {
      await page.goto(path);
      const link = page.getByTestId("project-link").locator('a[href="/project"]');
      await expect(link).toHaveText("See the project in 60 seconds");
      // On a phone's public view the line is hidden (it would push the search off the first screen): the nav's link is in view instead.
      if (phone && path === "/") await expect(link).toBeHidden();
      else await expect(link).toBeVisible();
    }
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "The project" })).toBeInViewport({ ratio: 1 });
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
    await expect(page.getByTestId("project-checks")).toHaveText("–");
    await expectNoHorizontalScroll(page);
  });
});
