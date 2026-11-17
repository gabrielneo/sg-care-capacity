import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, type Locator, type Page, test } from "@playwright/test";

import { expectNoA11yViolations, expectNoHorizontalScroll, expectProvenanceOnEveryFrame } from "./helpers";

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


test.describe("Findings: one band per finding", () => {
  test("the first screen has the title, one sentence and the data's date, and repeats no number", async ({ page }) => {
    await page.goto("/findings");
    const hero = page.getByTestId("hero");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Findings from the latest data release");
    await expect(hero.getByTestId("hero-summary")).toHaveText(/^Three findings on emergency department bed waits/);
    await expect(hero.getByTestId("provenance-line")).toHaveText(AS_OF);
    await expect(hero.getByTestId("finding-window")).toHaveText(/^ · This finding uses data to \d{1,2} [A-Z][a-z]{2} \d{4}$/);
    await expect(hero.getByTestId("freshness-badge")).toHaveText(/^Due an update · weekly$/);       // the date is the line's, stated once
    // The big number is Finding 1's, once: the old hero callout is gone.
    await expect(page.getByTestId("hero-number")).toHaveCount(0);
    await expect(page.getByTestId("countup")).toHaveCount(0);
    expect(await plain(page.getByTestId("site-purpose"))).toBe("Care-pacity looks at right-siting: treating people in the most suitable place, "
      + "such as a general practitioner (GP) clinic rather than a hospital, when it is safe to do so. "
      + "This site tracks both sides for Singapore's seniors: hospital emergency departments and nearby clinics.");
  });

  test("the bed wait is defined in the findings section, and is not the time to see a doctor", async ({ page }) => {
    await page.goto("/findings");
    expect(await plain(page.getByTestId("bed-wait-explainer"))).toMatch(/not the time to see a doctor/i);
  });

  test("three bands, in the API's rank order, each with its headline and key number", async ({ page }) => {
    const steps = await headline(page);
    await page.goto("/findings");
    const bands = page.getByTestId("finding-band");
    await expect(bands).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      expect(await plain(bands.nth(i).getByTestId("step-headline"))).toBe(steps[i]!.headline);
      await expect(bands.nth(i).getByTestId("delta-number")).toContainText(steps[i]!.display.value_text);
      await expect(bands.nth(i).getByTestId("chart-frame")).toHaveCount(1);
    }
    // Chapters alternate band and page.
    const tones = await page.locator("[data-testid=findings] [data-testid=section]").evaluateAll((els) => els.map((e) => e.getAttribute("data-tone")));
    expect(tones).toEqual(["band", "page", "band"]);
  });

  test("text left, chart right from 1024px; stacked below", async ({ page }, info) => {
    await page.goto("/findings");
    const band = page.getByTestId("finding-band").first();
    const text = await band.getByTestId("step-headline").boundingBox();
    const chart = await band.getByTestId("chart-frame").boundingBox();
    if (info.project.name === "mobile-375") {
      expect(chart!.y).toBeGreaterThan(text!.y);
      expect(Math.abs(chart!.x - text!.x)).toBeLessThan(2);
    } else {
      expect(chart!.x).toBeGreaterThan(text!.x + text!.width - 1);
      expect(chart!.width).toBeGreaterThan(text!.width);        // 7/12 against 5/12
    }
  });

  test("every finding says how strong its evidence is, with n and a 95% range where there is one (B1, B3)", async ({ page }) => {
    await page.goto("/findings");
    const lines = page.getByTestId("step-evidence");
    expect(await lines.count()).toBeGreaterThan(0);
    for (const line of await lines.all()) {
      await expect(line.getByTestId("evidence-chip")).toBeVisible();
      await expect(line).toContainText(/n = [\d,]+ \w/);
    }
    await expect(lines.first().getByTestId("evidence-chip")).toHaveAttribute("data-level", "robust");
    await expect(lines.first()).toContainText("95% range 4.6 to 5.4 hours");
    for (const detail of await page.getByTestId("step-detail").all()) {
      await expect(detail).not.toContainText("rarely by chance");
    }
  });

  test("each band has a one-line method, a quiet caveat and a closed drawer", async ({ page }) => {
    await page.goto("/findings");
    const band = page.getByTestId("finding-band").nth(1);
    await expect(band.getByTestId("finding-method")).toContainText("Method:");
    const caveat = band.getByTestId("finding-caveat");
    await expect(caveat).toContainText("One unusual week is not a trend.");
    await expect(caveat).not.toHaveAttribute("role", "alert");
    const drawer = band.getByTestId("finding-more");
    await expect(drawer).not.toHaveAttribute("open", "");
    await drawer.locator("summary").click();
    await expect(drawer.getByTestId("finding-window-range")).toBeVisible();
    await expect(band.getByTestId("who-acts")).toHaveCount(0);                              // the site analyses; planners decide (W3)
  });

  test("a finding's change is an arrow, a word and a colour (a longer wait is worse; neutral has no colour)", async ({ page }) => {
    await page.goto("/findings");
    const second = page.getByTestId("finding-band").nth(1);
    await expect(second.getByTestId("delta-change")).toContainText("▲ higher than usual");
    await expect(second.getByTestId("delta-change")).toHaveClass(/text-status-much/);
    await expect(page.getByTestId("finding-band").first().getByTestId("delta-change")).toHaveClass(/text-ink/);
  });

  test("a finding's warnings are only those on the data it uses (audit L-7)", async ({ page }) => {
    await page.goto("/findings");
    await expect(page.getByText(/data-quality warnings? appl/).first()).toBeAttached();
    for (const t of await page.getByText(/data-quality warnings? appl/).allTextContents()) {
      expect(t).toMatch(/^1 data-quality warning applies/);
    }
  });

  test("the findings' date and source are stated once for the section, and every chart is covered by it (review N1)", async ({ page }) => {
    await page.goto("/findings");
    const section = page.getByTestId("findings");
    const cards = section.getByTestId("chart-frame");
    await expect(cards).toHaveCount(3);
    await expect(section.getByTestId("section-meta").getByTestId("provenance-line")).toHaveText(AS_OF);
    await expect(section.getByTestId("section-meta").getByTestId("provenance-line")).toBeVisible();
    await expect(section.getByTestId("section-meta").getByTestId("freshness-badge")).toBeVisible();
    for (let i = 0; i < 3; i++) {
      await expect(cards.nth(i)).toHaveAttribute("data-provenance", "section");
      await expect(cards.nth(i).getByTestId("provenance-line")).toHaveCount(0);
      await expect(cards.nth(i).getByTestId("freshness-badge")).toHaveCount(0);
    }
    await expectProvenanceOnEveryFrame(page);
    await expect(section.getByText(/^Data as of/)).toHaveCount(1);
    await expect(page.getByTestId("why-now").getByTestId("provenance-line")).toHaveText(/^Data as of 30 Jun 2026 · Source: SingStat/);
  });

  test("why now: one year of population data is one figure, no trend", async ({ page }) => {
    await page.goto("/findings");
    const why = page.getByTestId("why-now");
    await expect(why.getByTestId("share-65")).toHaveText("22.1%");                         // 61,000 of 276,000 in the fixture
    expect(await plain(why.locator("p").nth(1))).toBe("That is 61,000 of 276,000 residents (citizens and permanent residents). "
      + "A super-aged society is one where 21% or more of people are aged 65 or over. "
      + "Among citizens alone, Singapore passed that mark in 2026 (population.gov.sg).");
    await expect(why.locator('[data-term="super_aged"]')).toBeVisible();
  });

  test("the limits are the case study's own list, as three calm cards", async ({ page }) => {
    const md = readFileSync(path.resolve(__dirname, "../../docs/case_study.md"), "utf8");
    const after = md.slice(md.indexOf("**What the data can't show**"));
    const items = [...after.matchAll(/^- (.+)$/gm)].slice(0, 3).map((m) => m[1]!);
    await page.goto("/findings");
    const cards = page.getByTestId("limit-card");
    await expect(cards).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      const text = (await plain(cards.nth(i))).replace(/^\d/, "").replace(/Emergency Department \(ED\)/g, "ED");
      expect(text.toLowerCase()).toBe(items[i]!.replace(/[;.]$/, "").toLowerCase());
    }
  });

  test("the depth cards each have a time estimate and lead somewhere", async ({ page }) => {
    await page.goto("/findings");
    const cards = page.getByTestId("depth-card");
    await expect(cards).toHaveCount(3);
    await expect(cards.getByTestId("depth-estimate")).toHaveText(["30 seconds", /^About \d+ min read$/, /^About \d+ min read$/]);
    await cards.nth(2).getByRole("link").click();
    await expect(page).toHaveURL(/\/docs\/insights-method$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("works at this width: no sideways scrolling", async ({ page }) => {
    await page.goto("/findings");
    await expectNoHorizontalScroll(page);
  });

  test("no sideways scrolling with a wider font, as Linux's fallback font is", async ({ page }) => {
    // CI's Chromium falls back to a wider font than macOS; a phrase that couldn't wrap overflowed there.
    await page.addInitScript(() => document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = "html, body, * { font-family: Verdana, 'DejaVu Sans', sans-serif !important; }";
      document.head.append(style);
    }));
    await page.goto("/findings");
    await expect(page.getByTestId("why-now")).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test("passes axe WCAG 2.1 AA checks", async ({ page }) => {
    await page.goto("/findings");
    await expectNoA11yViolations(page);
  });
});
