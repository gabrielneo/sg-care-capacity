import { existsSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { expectNoA11yViolations, expectNoHorizontalScroll } from "./helpers";

/** The weekday heatmap, in both themes at both widths: layout, the key, the phone layout, axe, and a snapshot of the chart. */
for (const scheme of ["light", "dark"] as const) {
  test.describe(`weekday heatmap, ${scheme}`, () => {
    test.use({ colorScheme: scheme });

    test("is laid out for the width, passes axe and does not scroll the page sideways", async ({ page }, info) => {
      await page.goto("/ed-trends");
      const card = page.getByTestId("chart-frame").filter({ hasText: "Bed wait by day of the week" });
      await card.scrollIntoViewIfNeeded();
      const mobile = info.project.name === "mobile-375";

      if (mobile) {                                                             // F3: transposed, scrolls with a hint
        await expect(card.getByTestId("heatmap-compact")).toBeVisible();
        await expect(card.getByTestId("heatmap")).toBeHidden();
        await expect(card.getByTestId("heat-scroll-hint")).toBeVisible();
        await expect(card.getByTestId("heat-scroller")).toHaveAttribute("tabindex", "0");
      } else {                                                                  // D8: a fixed 200px name column
        await expect(card.getByTestId("heatmap")).toBeVisible();
        await expect(card.getByTestId("heatmap-compact")).toBeHidden();
        const width = await card.getByTestId("heatmap").locator("tbody th[scope=row]").first().evaluate((el) => el.getBoundingClientRect().width);
        expect(Math.round(width)).toBe(200);
      }

      const swatches = card.getByTestId("heat-legend-class");                   // F1: seven, label below each
      await expect(swatches).toHaveCount(7);
      for (let i = 0; i < 7; i++) {
        const sw = await swatches.nth(i).locator("span").first().boundingBox();
        const label = await swatches.nth(i).locator("span").nth(1).boundingBox();
        expect(Math.round(sw!.width)).toBe(32);
        expect(Math.round(sw!.height)).toBe(12);
        expect(label!.y).toBeGreaterThanOrEqual(sw!.y + sw!.height);
      }
      await expect(card.getByTestId("heat-legend")).toContainText("Shorter than usual");
      await expect(card.getByTestId("heat-legend")).toContainText("Longer than usual");
      await expect(card.locator("#peak-cell")).toHaveCount(1);

      await expectNoA11yViolations(page, { wcag22: true });
      await expectNoHorizontalScroll(page);
      // A fixed clip, not the element's own box: the table is 134.2px tall, which an element screenshot rounds to 134 or 135 by scroll position.
      const target = card.getByTestId(mobile ? "heat-scroller" : "heatmap");
      await target.evaluate((el) => el.scrollIntoView({ block: "start" }));
      const box = (await target.boundingBox())!;
      // Reference images are per platform (fonts differ). Linux's come from the "Update screenshot baselines" workflow
      // (.github/workflows/screenshots.yml), on CI's own runner. Until one is committed, this platform's comparison is
      // skipped with a warning in the report, not failed; everything above still runs. Updating snapshots always compares.
      const name = `heatmap-${scheme}.png`;
      const updating = info.config.updateSnapshots === "all" || info.config.updateSnapshots === "changed";
      if (!updating && !existsSync(info.snapshotPath(name, { kind: "screenshot" }))) {
        info.annotations.push({ type: "warning", description: `No ${process.platform} reference for ${name}: run the "Update screenshot baselines" workflow and commit its images.` });
        return;
      }
      await expect(page).toHaveScreenshot(name, { maxDiffPixelRatio: 0.01,
        clip: { x: Math.floor(box.x), y: Math.floor(box.y), width: Math.floor(box.width), height: Math.floor(box.height) } });
    });
  });
}
