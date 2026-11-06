import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests: the real API on its fixture snapshot, the production build of the site, and a
 * second site instance pointed at an API that isn't running (for the error states).
 *   npm run e2e            (builds the site first)
 */
const API_PORT = 8791;
const WEB_PORT = 3301;
const WEB_DOWN_PORT = 3302; // API_BASE_URL points at a port nothing listens on

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: `http://127.0.0.1:${WEB_PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
    { name: "mobile-375", use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 812 }, hasTouch: true } },
  ],
  // Started in order: the API, then the site (built once), then the site with no API.
  webServer: [
    { command: "./e2e/start-api.sh", url: `http://127.0.0.1:${API_PORT}/api/v1/health`, reuseExistingServer: !process.env.CI,
      timeout: 120_000, env: { E2E_API_PORT: String(API_PORT) } },
    { command: `npm run build && npx next start -p ${WEB_PORT}`, url: `http://127.0.0.1:${WEB_PORT}/methodology`,
      reuseExistingServer: !process.env.CI, timeout: 300_000, env: { API_BASE_URL: `http://127.0.0.1:${API_PORT}` } },
    { command: `npx next start -p ${WEB_DOWN_PORT}`, url: `http://127.0.0.1:${WEB_DOWN_PORT}/methodology`,
      reuseExistingServer: !process.env.CI, timeout: 120_000, env: { API_BASE_URL: "http://127.0.0.1:8799" } },
  ],
});
