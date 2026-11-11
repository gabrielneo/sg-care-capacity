/**
 * The website's pages run next to the API. Vercel's default region is Washington DC (iad1); with
 * the API in Singapore, every API call a page made crossed the Pacific twice (about 0.2 s each,
 * measured 2026-11-11). Both settings live in files, so a test keeps them together.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const vercel = JSON.parse(readFileSync(path.resolve(__dirname, "../vercel.json"), "utf8")) as { regions?: string[] };
const render = parse(readFileSync(path.resolve(__dirname, "../../render.yaml"), "utf8")) as { services: { name: string; region: string }[] };

describe("deploy regions", () => {
  it("pages run in Singapore, where the API is", () => {
    expect(render.services.find((s) => s.name === "sg-health-api")?.region).toBe("singapore");
    expect(vercel.regions).toEqual(["sin1"]);
  });
});
