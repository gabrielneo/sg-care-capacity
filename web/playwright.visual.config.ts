import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

/**
 * The redesign's measuring stick (docs/design/redesign_brief.md), kept out of the e2e suite and CI:
 * `npm run e2e` uses playwright.config.ts, whose testDir is ./e2e, so nothing here runs by default.
 *   npm run visual:baseline   full-page screenshots -> tests/visual/__baseline__/   (@baseline)
 *   npm run ui:metrics        -> ../docs/design/ui_metrics_before.json            (@metrics)
 * Same servers as the e2e suite: the real API on its fixture snapshot, and the production build.
 * Screenshots are written with page.screenshot, never compared, so a diff can't fail a run.
 */
const servers = Array.isArray(base.webServer) ? base.webServer.slice(0, 2) : base.webServer;

export default defineConfig({
  testDir: "./tests/visual",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: "list",
  timeout: 180_000,
  use: {
    ...devices["Desktop Chrome"],
    ...base.use,
    contextOptions: { reducedMotion: "reduce" },
  },
  projects: [
    { name: "baseline", testMatch: "baseline.spec.ts" },
    { name: "metrics", testMatch: "metrics.spec.ts" },
  ],
  webServer: servers,
});
