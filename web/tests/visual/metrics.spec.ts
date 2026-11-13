import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "@playwright/test";
import { collectRaw, summarise, type RouteMetrics } from "../../scripts/ui-metrics";
import { VIEWPORTS } from "./routes";
import { allRoutes, openSettled } from "./settle";

/** Runs scripts/ui-metrics.ts over every route and viewport. `npm run ui:metrics`. */
const label = process.env.UI_METRICS_OUT ?? "before";
if (!/^[a-z0-9-]+$/.test(label)) throw new Error(`UI_METRICS_OUT must be a short slug, got "${label}"`);
const OUT = path.resolve(__dirname, "../../../docs/design", `ui_metrics_${label}.json`);

test("ui metrics", { tag: "@metrics" }, async ({ page, request }) => {
  const routes: Record<string, { path: string; viewports: Record<string, RouteMetrics> }> = {};
  for (const route of await allRoutes(request)) {
    const viewports: Record<string, RouteMetrics> = {};
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await openSettled(page, route.path);
      viewports[vp.name] = summarise(await page.evaluate(collectRaw), vp.width);
    }
    routes[route.name] = { path: route.path, viewports };
  }
  mkdirSync(path.dirname(OUT), { recursive: true });
  const body = {
    label,
    data: "API fixture snapshot (api/tests/fixture_snapshot.py), production build",
    definitions: "web/scripts/ui-metrics.ts",
    routes,
  };
  writeFileSync(OUT, `${JSON.stringify(body, null, 2)}\n`);
});
