import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { blockTiles, expectNoA11yViolations } from "./helpers";

// Searches too: they add sections that repeat terms (the React #418 hydration error of 2026-11-09).
const PAGES = ["/", "/?near=460001", "/?near=bedok", "/findings", "/ed-trends", "/access-map", "/live", "/data-quality", "/methodology", "/case-study", "/summary"];

const openapi = JSON.parse(readFileSync(path.resolve(__dirname, "../../api/openapi.json"), "utf8"));
const COLUMNS: string[] = [...new Set(Object.values(openapi.components.schemas as Record<string, { properties?: object }>)
  .flatMap((s) => Object.keys(s.properties ?? {})))].filter((n) => n.includes("_"));

test.beforeEach(async ({ page }) => blockTiles(page));

for (const route of PAGES) {
  test.describe(`terms on ${route}`, () => {
    test("the first visible abbreviation on the page is spelled out", async ({ page }) => {
      await page.goto(route);
      await page.locator('main [data-kind="abbr"]').first().waitFor({ state: "attached" });  // content streams in
      const first = await page.evaluate(() => {
        const el = [...document.querySelectorAll('main [data-kind="abbr"]')].find((e) => e.getClientRects().length > 0);
        return el ? { first: el.hasAttribute("data-first"), text: (el as HTMLElement).innerText } : null;
      });
      expect(first, "the page shows at least one abbreviation").not.toBeNull();
      expect(first!.first).toBe(true);
      expect(first!.text).toMatch(/^.+ \([A-Za-z]+\)$/);                    // e.g. "Ministry of Health (MOH)"
    });

    test("a term's tooltip opens from the keyboard and closes with Escape", async ({ page }) => {
      await page.goto(route);
      await expect(page.locator("main button.term").first()).toBeAttached();
      let focused = false;
      for (let i = 0; i < 200 && !focused; i++) {
        await page.keyboard.press("Tab");
        focused = await page.evaluate(() => document.activeElement?.matches("main button.term") ?? false);
      }
      expect(focused, "Tab reaches a term").toBe(true);
      const tipId = await page.evaluate(() => document.activeElement!.getAttribute("aria-describedby"));
      const tip = page.locator(`[id="${tipId}"]`);
      await expect(tip).toBeVisible();
      await expect(tip).toHaveAttribute("role", "tooltip");
      expect((await tip.innerText()).length).toBeGreaterThan(10);
      await page.keyboard.press("Escape");
      await expect(tip).toBeHidden();
    });

    test("no console or hydration errors", async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      expect(errors).toEqual([]);
    });
  });
}

const PUBLIC = ["/", "/?near=460001", "/findings", "/ed-trends", "/access-map", "/access-map?view=table", "/live", "/data-quality", "/case-study"];
for (const route of PUBLIC) {
  test(`no database column names in the visible text of ${route}`, async ({ page }) => {
    await page.goto(route);
    const text = await page.evaluate(() => {
      const main = document.querySelector("main")!.cloneNode(true) as HTMLElement;
      // Data Quality's check tables are a technical detail section (Rule 3).
      main.querySelectorAll('[data-testid^="checks-"]').forEach((e) => e.remove());
      document.body.appendChild(main);
      const t = main.innerText;
      main.remove();
      return t;
    });
    const found = COLUMNS.filter((c) => new RegExp(`\\b${c}\\b`).test(text));
    expect(found).toEqual([]);
  });
}

test.describe("glossary page", () => {
  test("lists every term spelled out, and search narrows it", async ({ page }) => {
    await page.goto("/glossary");
    await expect(page.getByRole("heading", { level: 1, name: "Glossary" })).toBeVisible();
    await expect(page.getByText("Community Health Assist Scheme (CHAS)")).toBeVisible();
    await page.getByLabel("Search the glossary").fill("diabetes");
    await expect(page.getByTestId("glossary-count")).toHaveText(/^1 of \d+ terms match$/);
    await expect(page.getByText("Chronic Disease Management Programme (CDMP)")).toBeVisible();
  });

  test("shows no unfinished definition", async ({ page }) => {
    await page.goto("/glossary");
    await expect(page.locator("main")).not.toContainText("TODO(me)");
    await expect(page.locator(".todo-me")).toHaveCount(0);
  });

  test("passes axe WCAG 2.1 AA checks", async ({ page }) => {
    await page.goto("/glossary");
    await expectNoA11yViolations(page);
  });
});
