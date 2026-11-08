import { expect, test } from "@playwright/test";

import { DOWN } from "./helpers";

/** Requirement S3: the figures behind each chart, as CSV, with "as of" and source on every row. */

/** RFC 4180: quoted cells may hold commas, doubled quotes and line breaks. */
function rows(body: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [], cur = "", quoted = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i]!;
    if (quoted) {
      if (c === '"' && body[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\r" && body[i + 1] === "\n") { row.push(cur); out.push(row); row = []; cur = ""; i++; }
    else cur += c;
  }
  return out;
}

test.describe("CSV downloads", () => {
  // One run is enough: the files don't depend on the viewport.
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1000, "desktop only");

  for (const [path, first] of [
    ["/export/ed-daily.csv", "hospital_code"],
    ["/export/ed-weekly.csv", "hospital_code"],
    ["/export/areas.csv", "planning_area_code"],
    ["/export/findings.csv", "headline_rank"],
  ] as const) {
    test(`${path} is a CSV with data_as_of and source on every row`, async ({ request }) => {
      const res = await request.get(path);
      expect(res.status()).toBe(200);
      expect(res.headers()["content-type"]).toBe("text/csv; charset=utf-8");
      expect(res.headers()["content-disposition"]).toMatch(/^attachment; filename="[a-z-]+-[\w.-]+\.csv"$/);
      const body = await res.text();
      expect(body.endsWith("\r\n")).toBe(true);
      const [cols, ...data] = rows(body);
      expect(cols![0]).toBe(first);
      expect(cols!.slice(-2)).toEqual(["data_as_of", "source"]);
      expect(data.length).toBeGreaterThan(0);
      for (const r of data) {
        expect(r).toHaveLength(cols!.length);
        expect(r.at(-2)).toMatch(/^\d{4}-\d{2}-\d{2}/);
        expect(r.at(-1)).not.toBe("");
      }
    });
  }

  test("the ED daily file follows the page's hospital and date filters", async ({ request }) => {
    const body = await (await request.get("/export/ed-daily.csv?hospital=SGH&from=2026-10-01&to=2026-10-31")).text();
    const data = rows(body).slice(1);
    expect(data.length).toBeGreaterThan(0);
    expect(new Set(data.map((r) => r[0]))).toEqual(new Set(["SGH"]));
    for (const r of data) expect(r[2]! >= "2026-10-01" && r[2]! <= "2026-10-31").toBe(true);
  });

  test("each finding is dated by and credited to its own sources (audit M-2)", async ({ request }) => {
    const [cols, ...data] = rows(await (await request.get("/export/findings.csv")).text());
    const col = (name: string) => cols!.indexOf(name);
    const access = data.filter((r) => r[col("type")] === "access_gap");
    const ed = data.filter((r) => ["trend", "anomaly", "weekday"].includes(r[col("type")]!));
    expect(access.length).toBeGreaterThan(0);
    for (const r of access) {
      expect(r[col("data_as_of")]).toMatch(/^2024-06-06/);                       // the CHAS clinic list's date
      expect(r[col("source")]).toContain("CHAS");
      expect(r[col("source")]).not.toContain("MOH");
    }
    for (const r of ed) {
      expect(r[col("data_as_of")]).toBe("2026-10-31");                          // MOH's latest day, not the window's end
      expect(r[col("source")]).not.toContain("CHAS");
    }
  });

  test("a missing figure is an empty cell, never 0", async ({ request }) => {
    // The same areas from the API itself (the e2e API runs on port 8791).
    const api = await (await request.get("http://127.0.0.1:8791/api/v1/areas/access")).json() as
      { data: { features: { properties: Record<string, unknown> }[] } };
    const [cols, ...data] = rows(await (await request.get("/export/areas.csv")).text());
    let empties = 0;
    data.forEach((r, i) => cols!.slice(0, -2).forEach((c, j) => {
      const v = api.data.features[i]!.properties[c];
      if (v == null) { expect(r[j]).toBe(""); empties++; }
      else expect(r[j]).toBe(String(v));
    }));
    expect(empties).toBeGreaterThan(0);
  });

  test("every chart on ED Trends and the Access Map offers its figures, and the links work", async ({ page, request }) => {
    for (const [path, count] of [["/ed-trends", 3], ["/access-map", 3]] as const) {
      await page.goto(path);
      const links = page.getByTestId("csv-download");
      await expect(links).toHaveCount(count);   // the Access Map shows its map or its table, not both
      for (const href of await links.evaluateAll((els) => els.map((e) => e.getAttribute("href")!))) {
        expect((await request.get(href)).headers()["content-type"]).toContain("text/csv");
      }
    }
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Download every finding (CSV)" })).toHaveAttribute("href", "/export/findings.csv");
  });

  test("the ED Trends links carry the hospitals chosen on the page", async ({ page }) => {
    await page.goto("/ed-trends?hospital=SGH");
    await expect(page.getByTestId("csv-download").first()).toHaveAttribute("href", /\/export\/ed-daily\.csv\?.*hospital=SGH/);
  });

  test("when the API is down, the download is a plain message, never an empty file", async ({ request }) => {
    const res = await request.get(`${DOWN}/export/findings.csv`);
    expect(res.status()).toBe(502);
    expect(res.headers()["content-type"]).toContain("text/plain");
    expect(await res.text()).toMatch(/reference: /);
  });
});
