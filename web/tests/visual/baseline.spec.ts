import path from "node:path";
import { test } from "@playwright/test";
import { VIEWPORTS } from "./routes";
import { allRoutes, liveTimestamps, openSettled } from "./settle";

/**
 * Visual baseline before the "calm & clear" redesign (docs/design/redesign_brief.md).
 * Writes full-page screenshots; compares nothing, so it never fails on a diff.
 *   npm run visual:baseline
 */
const OUT = path.join(__dirname, "__baseline__");

for (const vp of VIEWPORTS) {
  test(`baseline at ${vp.name}px`, { tag: "@baseline" }, async ({ page, request }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    for (const route of await allRoutes(request)) {
      await test.step(route.path, async () => {
        await openSettled(page, route.path);
        await page.screenshot({
          path: path.join(OUT, `${route.name}-${vp.name}.png`),
          fullPage: true,
          animations: "disabled",
          caret: "hide",
          mask: liveTimestamps(page),
        });
      });
    }
  });
}
