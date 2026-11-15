import { expect, test, type Page } from "@playwright/test";

import { blockTiles } from "./helpers";

/** Links and glossary terms look different (docs/design/redesign_brief.md, audit C4): links are accent; terms are not links, so they are dotted and never accent. */

const resolve = (page: Page, token: string) => page.evaluate((t) => {
  const probe = document.createElement("span");
  probe.style.color = `var(${t})`;
  document.body.append(probe);
  const colour = getComputedStyle(probe).color;
  probe.remove();
  return colour;
}, token);

test("a glossary term is dotted, in the tertiary colour, never the accent", async ({ page }) => {
  await blockTiles(page);
  await page.goto("/?view=planner");
  const term = page.locator("button.term").first();
  await expect(term).toBeVisible();
  const style = await term.evaluate((el) => { const s = getComputedStyle(el); return { line: s.textDecorationLine, kind: s.textDecorationStyle, decoration: s.textDecorationColor, colour: s.color }; });
  expect(style.line).toContain("underline");
  expect(style.kind).toBe("dotted");
  expect(style.decoration).toBe(await resolve(page, "--text-tertiary"));
  expect(style.colour).not.toBe(await resolve(page, "--accent"));
});

test("a link in running text is accent and always underlined", async ({ page }) => {
  await blockTiles(page);
  await page.goto("/methodology");
  const link = page.locator("main p a[href]").first();
  await expect(link).toBeVisible();
  const style = await link.evaluate((el) => { const s = getComputedStyle(el); return { line: s.textDecorationLine, colour: s.color }; });
  expect(style.line).toContain("underline");
  expect(style.colour).toBe(await resolve(page, "--accent"));
});

test("navigation links are underlined only on hover or focus, and the strip's plain text never is", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 500, "hover is a desktop measure");
  await blockTiles(page);
  await page.goto("/?view=planner");
  const line = (loc: ReturnType<Page["locator"]>) => loc.evaluate((el) => getComputedStyle(el).textDecorationLine);
  const nav = page.getByRole("navigation").getByRole("link", { name: "Findings" }).first();
  expect(await line(nav)).toBe("none");
  await nav.hover();
  expect(await line(nav)).toContain("underline");
  await page.mouse.move(0, 400);
  await nav.focus();
  expect(await line(nav)).toContain("underline");

  // The strip (audit C4, E4) is plain text, not a link: no underline at rest or on hover.
  await page.evaluate(() => window.scrollTo(0, 700));
  const strip = page.getByTestId("strip-summary");
  await expect(strip).toBeVisible();
  await page.mouse.move(0, 400);
  expect(await line(strip)).toBe("none");
  await strip.hover();
  expect(await line(strip)).toBe("none");
});
