import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, type Locator, type Page, test } from "@playwright/test";

import { expectNoA11yViolations, expectNoHorizontalScroll } from "./helpers";

const API = "http://127.0.0.1:8791/api/v1";
const AS_OF = /^Data as of \d{1,2} [A-Z][a-z]{2,3} \d{4} · Source: .+/;

/** What the API says the story should show (the fixture snapshot). */
async function headline(page: Page) {
  const body = await (await page.request.get(`${API}/insights?headline=true`)).json();
  return body.data as { insight_id: string; headline: string; display: { value_text: string; unit_text: string | null } }[];
}

/** Text as read, without glossary tooltips or screen-reader-only text. */
const plain = (locator: Locator) => locator.evaluate((el) => {
  const copy = el.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('[role="tooltip"], .sr-only').forEach((n) => n.remove());
  return (copy.textContent ?? "").replace(/\s+/g, " ").trim();
});

const animations = (page: Page) => page.evaluate(() => document.getAnimations().map((a) => (a as CSSAnimation).animationName ?? "transition"));
const scrollToStep = (page: Page, i: number) =>
  page.getByTestId("story-step").nth(i).evaluate((el) => el.scrollIntoView({ block: "center" }));

test.describe("Overview: the scroll story", () => {
  test("the hero number is the top insight's key number, from the API", async ({ page }) => {
    const [top] = await headline(page);
    await page.goto("/");
    const number = page.getByTestId("countup");
    await expect(number).toHaveAttribute("data-value", top!.display.value_text);
    expect(await number.locator(".countup-digits").textContent()).toBe(top!.display.value_text);
    await expect(number.locator(".sr-only")).toHaveText(`${top!.display.value_text} ${top!.display.unit_text}`);
    expect(await plain(page.getByRole("heading", { level: 1 }))).toBe(top!.headline);
    await expect(page.getByTestId("hero").getByTestId("provenance-line")).toHaveText(AS_OF);
    await expect(page.getByTestId("hero").locator("[data-level]")).toBeVisible();          // the freshness badge
  });

  test("without JavaScript the final number is already in the HTML", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    const [top] = await headline(page);
    await page.goto("/");
    await expect(page.getByTestId("countup")).toHaveAttribute("data-value", top!.display.value_text);
    expect(await page.getByTestId("countup").locator(".countup-digits").textContent()).toBe(top!.display.value_text);
    await expect(page.getByTestId("story-step")).toHaveCount(3);
    await context.close();
  });

  test("the three steps switch the chart panel's state", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "the sticky panel is desktop only; phones show each chart under its step");
    const steps = await headline(page);
    await page.goto("/");
    const charts = page.getByTestId("story-chart");
    await expect(charts).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      await scrollToStep(page, i);
      await expect(page.getByTestId("scrolly")).toHaveAttribute("data-active", String(i));
      for (let j = 0; j < 3; j++) await expect(charts.nth(j)).toHaveAttribute("data-current", String(i === j));
      await expect(charts.nth(i)).toHaveCSS("opacity", "1");
      await expect(charts.nth(i).getByTestId("chart-callout")).toBeVisible();
      expect(await plain(page.getByTestId("story-step").nth(i).getByTestId("step-headline"))).toBe(steps[i]!.headline);
    }
  });

  test("with reduced motion, nothing animates", async ({ browser }, info) => {
    const context = await browser.newContext({ reducedMotion: "reduce", viewport: info.project.use.viewport ?? undefined });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.getByTestId("story-step").first()).toBeVisible();
    expect(await animations(page)).toEqual([]);
    for (let i = 0; i < 3; i++) {
      await scrollToStep(page, i);
      if (info.project.name === "desktop") {
        await expect(page.getByTestId("story-chart").nth(i)).toHaveAttribute("data-current", "true");
        await expect(page.getByTestId("story-chart").nth(i)).toHaveCSS("opacity", "1");     // instantly
      }
      expect(await animations(page)).toEqual([]);
    }
    await page.getByTestId("why-now").scrollIntoViewIfNeeded();
    await expect(page.getByTestId("highlight")).toHaveAttribute("data-state", "drawn");
    expect(await animations(page)).toEqual([]);
    await context.close();
  });

  test("with motion allowed, the hero counts up (so the reduced-motion test means something)", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("countup")).toBeVisible();
    expect(await animations(page)).toContain("countup-roll");
  });

  test("every chart shows Data as of and its source", async ({ page }, info) => {
    await page.goto("/");
    const cards = page.getByTestId("findings").getByTestId("chart-card");
    await expect(cards).toHaveCount(6);                                   // each chart twice: under its step and in the panel
    for (let i = 0; i < 6; i++) await expect(cards.nth(i).getByTestId("provenance-line")).toHaveText(AS_OF);
    // The ones a reader can see at this width show it visibly.
    const visible = info.project.name === "desktop" ? page.locator(".story-panel [data-testid=chart-card]")
                                                   : page.locator(".story-inline [data-testid=chart-card]");
    for (let i = 0; i < 3; i++) {
      await scrollToStep(page, i);
      await expect(visible.nth(i).getByTestId("provenance-line")).toBeVisible();
    }
    await expect(page.getByTestId("why-now").getByTestId("provenance-line")).toHaveText(/^Data as of 30 Jun 2026 · Source: SingStat/);
  });

  test("each step has its headline, key number, detail, caveat and who acts", async ({ page }) => {
    const steps = await headline(page);
    await page.goto("/");
    const step = page.getByTestId("story-step").nth(1);
    await expect(step.getByTestId("delta-number")).toContainText(steps[1]!.display.value_text);
    await expect(step.getByTestId("delta-change")).toContainText("▲ higher than usual");
    await expect(step.getByTestId("delta-change")).toHaveClass(/text-bad/);                // a longer wait is worse
    await expect(step.locator("[data-testid=step-detail]")).not.toBeEmpty();
    await expect(step.getByText("One unusual week is not a trend.")).toBeVisible();
    await expect(step.getByTestId("who-acts")).toHaveText(/^Who acts: Not shown yet: the suggested action is waiting/);
    await expect(page.getByTestId("story-step").first().getByTestId("delta-change")).toHaveClass(/text-ink/);  // neutral: no colour
  });

  test("why now: one year of population data is one figure, no trend", async ({ page }) => {
    await page.goto("/");
    const why = page.getByTestId("why-now");
    await expect(why.getByTestId("share-65")).toHaveText("22.1%");                         // 61,000 of 276,000 in the fixture
    expect(await plain(why.locator("p").nth(1))).toBe("That is 61,000 of 276,000 residents. This share is what defines a super-aged society.");
    await expect(why.locator('[data-term="super_aged"]')).toBeVisible();
  });

  test("the limits are the case study's own list", async ({ page }) => {
    const md = readFileSync(path.resolve(__dirname, "../../docs/case_study.md"), "utf8");
    const after = md.slice(md.indexOf("**What the data can't show**"));
    const items = [...after.matchAll(/^- (.+)$/gm)].slice(0, 3).map((m) => m[1]!);
    await page.goto("/");
    const rendered = page.getByTestId("limits").getByRole("listitem");
    await expect(rendered).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      expect((await plain(rendered.nth(i))).replace(/Emergency Department \(ED\)/g, "ED")).toBe(items[i]);
    }
  });

  test("the depth cards each have a time estimate and lead somewhere", async ({ page }) => {
    await page.goto("/");
    const cards = page.getByTestId("depth-card");
    await expect(cards).toHaveCount(3);
    await expect(cards.getByTestId("depth-estimate")).toHaveText(["30 seconds", /^About \d+ min read$/, /^About \d+ min read$/]);
    await cards.nth(2).getByRole("link").click();
    await expect(page).toHaveURL(/\/docs\/insights-method$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("works at this width: no sideways scrolling, and the right chart layout", async ({ page }, info) => {
    await page.goto("/");
    await expectNoHorizontalScroll(page);
    if (info.project.name === "mobile-375") {
      await expect(page.getByTestId("story-panel")).toBeHidden();
      for (let i = 0; i < 3; i++) await expect(page.locator(".story-inline").nth(i)).toBeVisible();
    } else {
      await expect(page.getByTestId("story-panel")).toBeVisible();
      await expect(page.locator(".story-inline").first()).toBeHidden();
    }
    for (let i = 0; i < 3; i++) {
      await scrollToStep(page, i);
      await expectNoHorizontalScroll(page);
    }
  });

  test("no layout shift from the count-up", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("countup")).toBeVisible();
    const box = async () => page.getByTestId("hero-number").boundingBox();
    const first = await box();
    await page.waitForTimeout(700);                                                         // after the 600 ms roll
    expect(await box()).toEqual(first);
    const shift = await page.evaluate(() => new Promise<number>((resolve) => {
      let total = 0;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
          if (!e.hadRecentInput) total += e.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
      setTimeout(() => resolve(total), 100);
    }));
    expect(shift).toBeLessThan(0.01);
  });

  test("passes axe WCAG 2.1 AA checks", async ({ page }) => {
    await page.goto("/");
    await expectNoA11yViolations(page);
  });
});
