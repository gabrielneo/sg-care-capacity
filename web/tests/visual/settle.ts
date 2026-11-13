import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { blockTiles } from "../../e2e/helpers";
import { API_ORIGIN, hospitalRoute, ROUTES, type VisualRoute } from "./routes";

/** Every route in scope, with one ED Trends page per hospital the API lists. */
export async function allRoutes(request: APIRequestContext): Promise<VisualRoute[]> {
  const res = await request.get(`${API_ORIGIN}/api/v1/hospitals`);
  if (!res.ok()) throw new Error(`GET /api/v1/hospitals: ${res.status()}`);
  const { data } = (await res.json()) as { data: { hospital_code: string }[] };
  return [...ROUTES, ...data.map((h) => hospitalRoute(h.hospital_code))];
}

/** Open a route and wait until it is still: network idle, web fonts loaded, no running animations. */
export async function openSettled(page: Page, path: string) {
  await blockTiles(page);
  await page.goto(path, { waitUntil: "networkidle" });
  await page.evaluate(async () => {
    await document.fonts.ready;
    for (const a of document.getAnimations()) a.finish();
  });
}

/**
 * What changes with the clock rather than the design: every <time>, freshness ages ("12 days old"),
 * freshness labels (judged against today's date) and NUHS "updated …" times.
 */
export function liveTimestamps(page: Page): Locator[] {
  return [
    page.locator("time"),
    // An age ("12 days old"), not fixed copy such as "can be up to 7 days old".
    page.getByText(/(?<!up to )\b\d+ (day|week|month|year)s? old\b/),
    page.getByText(/^(Up to date|Due an update|Out of date|Date unknown)$/),
    page.getByText(/\bupdated \d{1,2} [A-Z][a-z]{2,3} \d{4}/),
    // The footer's release check (lib/release.ts) names the next check day relative to today.
    page.getByText(/check hasn't produced a newer release/),
  ];
}
