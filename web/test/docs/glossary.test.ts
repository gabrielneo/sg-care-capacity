import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

import { GLOSSARY } from "@/lib/glossary.generated";

import { render, validate } from "../../scripts/gen-glossary.mjs";

const DOCS = path.resolve(__dirname, "../../../docs");
const yml = parse(readFileSync(path.join(DOCS, "glossary.yml"), "utf8")) as { terms: Record<string, unknown>[] };
const rules = readFileSync(path.join(DOCS, "language_rules.md"), "utf8");

/** Table rows (cells) under a "## Rule n" heading, up to the next "## ". */
function ruleRows(rule: string): string[][] {
  const start = rules.indexOf(`\n## ${rule}`);
  const end = rules.indexOf("\n## ", start + 4);
  return rules.slice(start, end).split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| ---"))
    .map((l) => l.slice(1, -1).split(" | ").map((c) => c.trim())).filter((r) => !["Abbreviation", "Term", "Internal term"].includes(r[0]!));
}
const byAbbr = (a: string) => GLOSSARY.find((t) => t.abbreviation === a || t.full_name.toLowerCase() === a.toLowerCase());
const stripDot = (s: string) => s.replace(/\.$/, "");

describe("glossary.yml", () => {
  it("is valid and the committed module matches it", () => {
    expect(validate(yml.terms)).toEqual([]);
    expect(readFileSync(path.resolve(__dirname, "../../lib/glossary.generated.ts"), "utf8")).toBe(render(yml.terms));
  });

  it.each(ruleRows("Rule 1"))("Rule 1: %s matches language_rules.md", (abbr, firstUse, hover) => {
    const t = byAbbr(abbr!);
    expect(t, `${abbr} is missing from glossary.yml`).toBeDefined();
    expect(t!.category).toBe("keep_abbreviation");
    const expected = t!.abbreviation === t!.full_name ? t!.full_name : `${t!.full_name} (${t!.abbreviation})`;
    expect(expected.toLowerCase()).toBe(firstUse!.toLowerCase());
    expect(stripDot(t!.plain_definition)).toBe(stripDot(hover!));
  });

  it.each(ruleRows("Rule 2"))("Rule 2: %s matches language_rules.md", (name, explanation) => {
    const t = GLOSSARY.find((g) => g.full_name === name);
    expect(t, `${name} is missing`).toBeDefined();
    expect(t!.category).toBe("keep_and_explain");
    expect(stripDot(t!.plain_definition)).toBe(stripDot(explanation!));
  });

  it.each(ruleRows("Rule 3"))("Rule 3: %s matches language_rules.md", (internal, publicWording) => {
    const t = GLOSSARY.find((g) => g.full_name === internal);
    expect(t, `${internal} is missing`).toBeDefined();
    expect(t!.category).toBe("technical_only");
    expect(publicWording!.startsWith(t!.public_wording!.replace(/\.\.\.$/, ""))).toBe(true);
  });

  it("marks a TODO(me) definition as pending, not finished", () => {
    expect(GLOSSARY.find((t) => t.id === "has")!.pending).toBe(true);
    expect(GLOSSARY.filter((t) => t.pending).map((t) => t.id)).toEqual(["has"]);
  });
});
