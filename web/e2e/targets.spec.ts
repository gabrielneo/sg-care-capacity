import { expect, test } from "@playwright/test";

import { blockTiles } from "./helpers";

/**
 * Primary controls are at least 44 x 44 px on a phone (docs/ux_audit.md, M3). Exempt, as in WCAG 2.5.8: links inside
 * running text, glossary terms (inline buttons in a sentence), screen-reader-only elements, and a checkbox or radio
 * whose label is itself the 44px target.
 */
const ROUTES = ["/", "/find", "/ed-trends", "/live", "/access-map", "/findings", "/data-quality",
  "/methodology", "/glossary", "/project", "/about", "/explore", "/styleguide"];

test.use({ viewport: { width: 375, height: 812 } });

for (const route of ROUTES) {
  test(`${route}: primary controls are at least 44px at 375px`, async ({ page }) => {
    await blockTiles(page);
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    const small = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>("a[href], button, input:not([type=hidden]), select, summary, [role=button]")) {
        const box = el.getBoundingClientRect();
        if (box.width <= 1 || box.height <= 1) continue;                                  // sr-only
        const style = getComputedStyle(el);
        if (style.visibility === "hidden" || el.closest("[hidden]")) continue;
        if (el.classList.contains("term")) continue;                                      // glossary term, inline in a sentence
        if (el.tagName === "A" && style.display === "inline") continue;                   // a link in running text
        if (el instanceof HTMLInputElement && el.labels?.[0]) {
          const l = el.labels[0].getBoundingClientRect();
          if (l.height >= 44) continue;
        }
        if (box.height < 44 || box.width < 44) out.push(`${el.tagName.toLowerCase()} ${Math.round(box.width)}x${Math.round(box.height)} "${(el.textContent ?? "").trim().slice(0, 30)}"`);
      }
      return out;
    });
    expect(small).toEqual([]);
  });
}
