import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_BLOB, routeForDoc, siteHref } from "./docLinks";

describe("doc links", () => {
  it.each([
    ["data_quality.md", "methodology.md", "/docs/data-quality"],
    ["data_dictionary.md#marts-what-the-api-and-site-read", "methodology.md", "/docs/data-dictionary#marts-what-the-api-and-site-read"],
    ["methodology.md#limitations", "case_study.md", "/methodology#limitations"],
    ["adr/0002-validation-gate.md", "case_study.md", "/decisions/0002-validation-gate"],
    ["../runbook.md", "adr/0001-published-snapshot.md", "/docs/runbook"],
    ["0003-svy21-for-distances-and-areas.md", "adr/README.md", "/decisions/0003-svy21-for-distances-and-areas"],
    ["#how-it-works", "data_quality.md", "#how-it-works"],
    ["https://www.onemap.gov.sg/", "methodology.md", "https://www.onemap.gov.sg/"],
    ["../pipeline/sg_health/geo.py", "methodology.md", `${REPO_BLOB}pipeline/sg_health/geo.py`],
  ])("%s in %s -> %s", (href, from, expected) => {
    expect(siteHref(href, from)).toBe(expected);
  });

  it("maps every link between the real docs to a page that exists, or to GitHub", () => {
    const docs = path.resolve(__dirname, "../../docs");
    const files = [...readdirSync(docs).filter((f) => f.endsWith(".md")),
                   ...readdirSync(path.join(docs, "adr")).map((f) => `adr/${f}`)];
    const known = new Set(files.map((f) => routeForDoc(f)).filter(Boolean));
    for (const file of files) {
      for (const m of readFileSync(path.join(docs, file), "utf8").matchAll(/\]\(([^)\s]+\.md)(#[^)]*)?\)/g)) {
        const href = siteHref(`${m[1]}${m[2] ?? ""}`, file);
        const route = href.split("#")[0]!;
        expect(known.has(route) || href.startsWith(REPO_BLOB), `${file}: ${m[1]} -> ${href}`).toBe(true);
      }
    }
  });
});
