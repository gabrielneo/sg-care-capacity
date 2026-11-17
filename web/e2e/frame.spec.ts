import { expect, type Page, test } from "@playwright/test";

import { blockTiles, expectNoA11yViolations, expectNoHorizontalScroll } from "./helpers";

/**
 * The site's frame, kept quiet so the content leads (audit E2, E4, E5, I1): header, menu sheet, view switch, notices and footer.
 * Both projects run this file (1280 and 375 px); tests say which they are for.
 */
/** The header's row (nav and view switch) starts at 1024px; below it, the Menu sheet (components/SiteHeader.tsx). */
const wide = (page: Page) => (page.viewportSize()?.width ?? 1280) >= 1024;

test.beforeEach(async ({ page }) => blockTiles(page));

test.describe("header", () => {
  test("is one row of 64px from 768px and 56px below it, on the page colour with a hairline below", async ({ page }) => {
    await page.goto("/findings");
    const header = page.getByTestId("site-header");
    const box = (await header.boundingBox())!;
    // The hairline is inside the height.
    expect(box.height).toBe(wide(page) ? 64 : 56);
    const css = await header.evaluate((el) => { const s = getComputedStyle(el); return { bg: s.backgroundColor, border: s.borderBottomWidth }; });
    expect(css).toEqual({ bg: "rgb(247, 251, 250)", border: "1px" });
    await expect(page.getByTestId("wordmark")).toContainText("Care-pacity");
    expect(await page.getByTestId("wordmark").locator(".font-serif").evaluate((el) => getComputedStyle(el).fontSize)).toBe("18px");
  });

  test("shows the tagline from 1024px, five sections, and an underlined (not filled) current page", async ({ page }) => {
    test.skip(!wide(page), "the row is for 768px and wider");
    await page.goto("/findings");
    const tagline = page.getByTestId("wordmark").getByText("in a super-aged Singapore");
    if ((page.viewportSize()?.width ?? 0) >= 1024) await expect(tagline).toBeVisible(); else await expect(tagline).toBeHidden();
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav.getByRole("link")).toHaveCount(5);
    const current = nav.locator('a[aria-current="page"]');
    await expect(current).toHaveText("Findings");
    const css = await current.evaluate((el) => { const s = getComputedStyle(el); return { underline: s.borderBottomWidth, color: s.borderBottomColor, text: s.color, bg: s.backgroundColor }; });
    expect(css.underline).toBe("2px");
    expect(css.color).toBe(css.text);                                  // the accent, in both
    expect(css.bg).toBe("rgba(0, 0, 0, 0)");                           // no filled pill
  });

  test("has no menu button from 1024px, and a Menu button below it", async ({ page }) => {
    await page.goto("/findings");
    if (wide(page)) await expect(page.getByTestId("menu-button")).toBeHidden(); else await expect(page.getByTestId("menu-button")).toBeVisible();
  });

  for (const width of [375, 768, 1280, 1440]) {
    for (const path of ["/", "/find", "/find?view=analyst", "/about", "/findings"]) {
      test(`${path} has no sideways scrolling at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        await expectNoHorizontalScroll(page);
      });
    }
  }
});

test.describe("header fits its row (CI 2026-11-16)", () => {
  // On CI's Linux fonts the 768px header scrolled the page sideways (801px): wordmark, nav and view switch need about 822px.
  // A wide font (Verdana, wider than the Mac's system font, like Linux's fallback) stands in for those fonts here.
  for (const width of [768, 1023, 1024, 1280]) {
    test(`at ${width}px with a wide font: one-line wordmark, nothing past the edge`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/find");
      await page.addStyleTag({ content: "*{font-family:Verdana,'DejaVu Sans',sans-serif !important}" });
      const name = page.getByTestId("wordmark").locator("span").first();
      const box = (await name.boundingBox())!;
      const line = await name.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
      expect(box.height, "the wordmark is one line").toBeLessThan(line * 1.5);
      await expectNoHorizontalScroll(page);
      await expect(page.getByTestId(width >= 1024 ? "view-switch" : "menu-button")).toBeVisible();
    });
  }
});

test.describe("menu sheet (below 1024px)", () => {
  test.skip(({ page }) => wide(page), "a phone-width flow");

  test("keyboard: opens, traps focus, closes with Esc, and returns focus to Menu", async ({ page }) => {
    await page.goto("/find?view=analyst");
    const button = page.getByTestId("menu-button");
    const sheet = page.getByTestId("menu-sheet");
    await expect(sheet).toBeHidden();
    await expect(button).toHaveAttribute("aria-expanded", "false");

    // Reach the button with Tab (skip link, wordmark, Menu), open it with Enter.
    for (let i = 0; i < 5 && !(await button.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
    await expect(button).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(sheet).toBeVisible();
    await expect(button).toHaveAttribute("aria-expanded", "true");
    expect(await sheet.evaluate((el) => (el as HTMLDialogElement).open)).toBe(true);
    // Full height, and focus is inside it.
    expect((await sheet.boundingBox())!.height).toBeGreaterThanOrEqual(812 - 1);
    expect(await page.evaluate(() => !!document.activeElement?.closest('[data-testid="menu-sheet"]'))).toBe(true);

    // Tab and Shift+Tab never leave the sheet.
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => !!document.activeElement?.closest('[data-testid="menu-sheet"]')), `Tab ${i + 1}`).toBe(true);
    }
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press("Shift+Tab");
      expect(await page.evaluate(() => !!document.activeElement?.closest('[data-testid="menu-sheet"]')), `Shift+Tab ${i + 1}`).toBe(true);
    }

    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(button).toBeFocused();
  });

  test("holds the five sections, the view choice (on Home) and a tel:995 link; following a link closes it", async ({ page }) => {
    await page.goto("/find?view=planner");
    await page.getByTestId("menu-button").click();
    const sheet = page.getByTestId("menu-sheet");
    await expect(sheet.getByRole("navigation", { name: "Menu" }).getByRole("link")).toHaveCount(5);
    const group = sheet.getByRole("radiogroup", { name: "View" });
    await expect(group.getByRole("radio")).toHaveCount(3);
    await expect(group.getByRole("radio", { name: "Planner" })).toBeChecked();
    await expect(sheet.getByTestId("menu-995").getByRole("link", { name: "Call 995" })).toHaveAttribute("href", "tel:995");
    // Every control in it is a 44px tap target.
    for (const el of await sheet.locator("a, button, label").all()) {
      const box = await el.boundingBox();
      if (box && box.width > 1) expect(box.height, await el.innerText()).toBeGreaterThanOrEqual(44);
    }
    await sheet.getByRole("link", { name: /^Findings/ }).click();
    await expect(page).toHaveURL(/\/findings$/);
    await expect(sheet).toBeHidden();
    // Off the home page there is no view choice in the sheet.
    await page.getByTestId("menu-button").click();
    await expect(page.getByTestId("menu-sheet").getByTestId("view-radios-sheet")).toHaveCount(0);
  });

  test("passes the accessibility checks while open", async ({ page }) => {
    await page.goto("/find");
    await page.getByTestId("menu-button").click();
    await expectNoA11yViolations(page, { wcag22: true });
  });
});

test.describe("view switch", () => {
  const pick = async (page: Page, label: string) => {
    if (wide(page)) await page.getByTestId("view-radios").getByText(label, { exact: true }).click();
    else {
      await page.getByTestId("menu-button").click();
      await page.getByTestId("menu-sheet").getByTestId("view-radios-sheet").getByText(label, { exact: true }).click();
    }
  };
  const checked = async (page: Page, label: string) => {
    if (wide(page)) await expect(page.getByRole("radio", { name: label, exact: true })).toBeChecked();
    else {
      await page.getByTestId("menu-button").click();
      await expect(page.getByTestId("menu-sheet").getByTestId("view-radios-sheet").getByRole("radio", { name: label, exact: true })).toBeChecked();
      await page.keyboard.press("Escape");
    }
  };

  test("round-trips through the URL: choose, reload, back and forward", async ({ page }) => {
    await page.goto("/find");
    await pick(page, "Planner");
    await expect(page).toHaveURL(/\/find\?view=planner$/);
    await expect(page.getByTestId("home")).toHaveAttribute("data-view", "planner");
    await pick(page, "Analyst");
    await expect(page).toHaveURL(/\/find\?view=analyst$/);
    await expect(page.getByTestId("home")).toHaveAttribute("data-view", "analyst");

    await page.reload();                                               // the URL is the state
    await expect(page.getByTestId("home")).toHaveAttribute("data-view", "analyst");
    await checked(page, "Analyst");

    await page.goBack();
    await expect(page).toHaveURL(/\/find\?view=planner$/);
    await expect(page.getByTestId("home")).toHaveAttribute("data-view", "planner");
    await checked(page, "Planner");
    await page.goForward();
    await expect(page.getByTestId("home")).toHaveAttribute("data-view", "analyst");

    await pick(page, "Public");                                        // the plain address, no ?view=
    await expect(page).toHaveURL(/\/find$/);
    await expect(page.getByTestId("home")).toHaveAttribute("data-view", "public");
  });

  test("opens straight onto a shared link's view", async ({ page }) => {
    await page.goto("/find?view=analyst");
    await checked(page, "Analyst");
  });

  test("a 36px segmented control from 1024px", async ({ page }) => {
    test.skip(!wide(page), "the header's control");
    await page.goto("/find");
    const box = (await page.getByTestId("view-radios").boundingBox())!;
    expect(box.height).toBeCloseTo(36, 0);
    const selected = page.getByTestId("view-radios").locator("label", { has: page.getByRole("radio", { name: "Public", exact: true }) });
    expect(await selected.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(214, 240, 242)");   // accent-soft
    await expect(selected).toContainText("✓");                          // and a tick: not colour alone
  });
});

test.describe("first screen on a phone (I1)", () => {
  test.skip(({ page }) => wide(page), "a phone-width measure");

  test("the first heading is within 120px of the top and the first KPI number is in view at 375×812", async ({ page }) => {
    await page.goto("/find?view=analyst");
    const h1 = page.getByRole("heading", { level: 1 });
    expect((await h1.boundingBox())!.y).toBeLessThan(120);
    await expect(h1).toBeInViewport({ ratio: 1 });
    await expect(page.getByTestId("summary-tile").first().locator(".text-kpi")).toBeInViewport({ ratio: 1 });
    // The compact notice is under the heading, in one block, before the numbers.
    const [h, n, k] = await Promise.all([h1.boundingBox(), page.getByTestId("emergency-note").boundingBox(), page.getByTestId("summary-tile").first().boundingBox()]);
    expect(n!.y).toBeGreaterThan(h!.y + h!.height - 1);
    expect(k!.y).toBeGreaterThan(n!.y);
  });
});

test.describe("notices (E5)", () => {
  test("public: no 995 banner (the footer has the number); planner and analyst: one compact line under the H1", async ({ page }) => {
    await page.goto("/find");
    await expect(page.getByTestId("emergency-note")).toHaveCount(0);
    await expect(page.getByTestId("footer-notice").getByRole("link", { name: "Call 995" })).toHaveAttribute("href", "tel:995");
    for (const view of ["planner", "analyst"]) {
      await page.goto(`/find?view=${view}`);
      const note = page.getByTestId("emergency-note");
      await expect(note).toContainText("✚ Emergency? Call 995. This site shows public statistics, not medical advice.");
      await expect(note.getByRole("link", { name: "Call 995" })).toHaveAttribute("href", "tel:995");
      if (wide(page)) expect((await note.boundingBox())!.height).toBeLessThan(30);          // one line
    }
  });
});

test.describe("footer", () => {
  test("on a phone the footer's links wrap in rows, each still a 44px target (review N2)", async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) >= 640, "phones only");
    await page.goto("/methodology");
    const links = page.getByTestId("site-footer").locator("ul").first().getByRole("link");
    const boxes = await Promise.all((await links.all()).map((l) => l.boundingBox()));
    for (const b of boxes) expect(b!.height).toBeGreaterThanOrEqual(44);
    expect(new Set(boxes.map((b) => Math.round(b!.y))).size).toBeLessThan(boxes.length);    // some share a row
  });

  test("three columns with at most six links each, on the band colour, credits on one line", async ({ page }) => {
    await page.goto("/findings");
    const footer = page.getByTestId("site-footer");
    expect(await footer.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(227, 244, 241)");
    const columns = footer.getByTestId("footer-column");
    await expect(columns).toHaveCount(3);
    await expect(columns.locator("[data-footer-title]")).toHaveText(["Data and privacy", "About this project", "Help"]);
    for (const c of await columns.all()) expect(await c.getByRole("link").count()).toBeLessThanOrEqual(6);
    await expect(columns.nth(1).getByRole("link")).toHaveText([/^The project in 60 seconds/, /^Case study/, /^GitHub/, /^CV/]);
    await expect(columns.nth(2).getByRole("link", { name: "Glossary" })).toHaveAttribute("href", "/glossary");
    await expect(columns.nth(2).getByTestId("footer-notice").getByRole("link", { name: "Call 995" })).toHaveAttribute("href", "tel:995");
    expect(await footer.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBe(14);   // text-small
    if (wide(page)) expect((await footer.getByTestId("footer-credits").locator("span").boundingBox())!.height).toBeLessThan(30);   // one line
    await expectNoHorizontalScroll(page);
    await expectNoA11yViolations(page, { wcag22: true });
  });
});
