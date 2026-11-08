import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ADR_DIR = path.resolve(__dirname, "../../../docs/adr");
const files = readdirSync(ADR_DIR).filter((f) => /^\d{4}-.+\.md$/.test(f)).sort();
const SECTIONS = ["## Context", "## Decision", "## Alternatives considered", "## Consequences", "## How it is enforced"];

describe("architecture decision records", () => {
  it("has the six decisions so far, numbered in order", () => {
    expect(files.map((f) => f.slice(0, 4))).toEqual(["0001", "0002", "0003", "0004", "0005", "0006"]);
  });

  it.each(files)("%s has a title, a status and every section", (file) => {
    const text = readFileSync(path.join(ADR_DIR, file), "utf8");
    expect(text).toMatch(new RegExp(`^# ${file.slice(0, 4)}: .+`));
    expect(text).toMatch(/\*\*Status:\*\* (Proposed|Accepted|Superseded by \[\d{4}\]|Deprecated) · \*\*Date:\*\* \d{4}-\d{2}-\d{2}/);
    for (const s of SECTIONS) expect(text, `${file} lacks "${s}"`).toContain(`\n${s}\n`);
  });

  it("lists every record in the index", () => {
    const index = readFileSync(path.join(ADR_DIR, "README.md"), "utf8");
    for (const f of files) expect(index).toContain(`(${f})`);
  });
});
