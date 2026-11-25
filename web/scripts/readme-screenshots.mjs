// Regenerates the README's three screenshots from a running site (docs/images/home.png, home-dark.png, home-phones.png).
//   1. Serve the release you want to show:  DATA_SNAPSHOT=data-YYYY-MM-DD uvicorn --factory sg_health_api.main:create_app --port 8800
//   2. Serve the site:                      API_BASE_URL=http://127.0.0.1:8800 npm run build && API_BASE_URL=http://127.0.0.1:8800 npx next start -p 3330
//   3. Run:                                 node scripts/readme-screenshots.mjs [http://127.0.0.1:3330]
// Then change the release id in the README line "Screenshots from data release ..." to the one you served.
import { chromium } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const base = process.argv[2] ?? "http://127.0.0.1:3330";
const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../docs/images");
const browser = await chromium.launch();

async function shot(file, { width, height, scheme, full = false }) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(base + "/", { waitUntil: "networkidle" });
  const buffer = await page.screenshot({ path: file ?? undefined, fullPage: full });
  await ctx.close();
  return buffer;
}

await shot(path.join(out, "home.png"), { width: 1280, height: 900, scheme: "light" });
await shot(path.join(out, "home-dark.png"), { width: 1280, height: 900, scheme: "dark" });
// The phone picture: light and dark side by side, each 375 px wide, composed on one page.
const light = (await shot(null, { width: 375, height: 760, scheme: "light" })).toString("base64");
const dark = (await shot(null, { width: 375, height: 760, scheme: "dark" })).toString("base64");
const ctx = await browser.newContext({ viewport: { width: 776, height: 814 } });
const page = await ctx.newPage();
await page.setContent(`<body style="margin:0;background:#e9e7f3;display:flex;gap:16px;padding:27px 5px;box-sizing:border-box">
  <img src="data:image/png;base64,${light}" style="width:375px;border-radius:12px"><img src="data:image/png;base64,${dark}" style="width:375px;border-radius:12px"></body>`);
await page.screenshot({ path: path.join(out, "home-phones.png") });
await browser.close();
console.log("wrote home.png, home-dark.png, home-phones.png in", out);
