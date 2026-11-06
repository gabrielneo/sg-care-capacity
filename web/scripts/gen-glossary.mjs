#!/usr/bin/env node
// Generate lib/glossary.generated.ts from ../docs/glossary.yml, validating every entry.
// Run: npm run gen:glossary   (CI: npm run check:glossary fails if the committed file is stale)
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, "../../docs/glossary.yml");
const OUT = path.resolve(here, "../lib/glossary.generated.ts");
const CATEGORIES = ["keep_abbreviation", "keep_and_explain", "technical_only"];
const MAX_WORDS = 25;

export function validate(terms) {
  const problems = [];
  const ids = new Set();
  for (const [i, t] of terms.entries()) {
    const where = `term ${i + 1} (${t?.id ?? "no id"})`;
    if (!t || typeof t !== "object") { problems.push(`${where}: not an object`); continue; }
    if (!/^[a-z][a-z0-9_]*$/.test(t.id ?? "")) problems.push(`${where}: id must be lower_snake_case`);
    if (ids.has(t.id)) problems.push(`${where}: duplicate id`);
    ids.add(t.id);
    if (!CATEGORIES.includes(t.category)) problems.push(`${where}: category must be one of ${CATEGORIES.join(", ")}`);
    if (!t.full_name) problems.push(`${where}: full_name is required`);
    if (!t.plain_definition) problems.push(`${where}: plain_definition is required`);
    else if (t.plain_definition.trim().split(/\s+/).length > MAX_WORDS) problems.push(`${where}: plain_definition is over ${MAX_WORDS} words`);
    if (t.category === "keep_abbreviation" && !t.abbreviation) problems.push(`${where}: keep_abbreviation needs an abbreviation`);
    if (t.category === "technical_only" && !t.public_wording) problems.push(`${where}: technical_only needs public_wording`);
    if (t.source_url && !/^https:\/\/\S+$/.test(t.source_url)) problems.push(`${where}: source_url must be https`);
    for (const k of Object.keys(t)) {
      if (!["id", "abbreviation", "full_name", "plain_definition", "category", "source_url", "aliases", "public_wording"].includes(k)) {
        problems.push(`${where}: unknown field ${k}`);
      }
    }
  }
  return problems;
}

export function render(terms) {
  const body = JSON.stringify(terms.map((t) => ({
    id: t.id,
    abbreviation: t.abbreviation ?? null,
    full_name: t.full_name,
    plain_definition: t.plain_definition.trim(),
    category: t.category,
    source_url: t.source_url ?? null,
    aliases: t.aliases ?? [],
    public_wording: t.public_wording ?? null,
    pending: /TODO\(me\)/.test(t.plain_definition),
  })), null, 2);
  return `// GENERATED from docs/glossary.yml by scripts/gen-glossary.mjs. Do not edit; run npm run gen:glossary.
export type GlossaryCategory = "keep_abbreviation" | "keep_and_explain" | "technical_only";

export interface GlossaryEntry {
  id: string;
  abbreviation: string | null;
  full_name: string;
  plain_definition: string;
  category: GlossaryCategory;
  source_url: string | null;
  aliases: readonly string[];
  public_wording: string | null;
  /** True while the definition is still a TODO(me) for the author. */
  pending: boolean;
}

export const GLOSSARY = ${body} as const satisfies readonly GlossaryEntry[];

export type GlossaryId = (typeof GLOSSARY)[number]["id"];
`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { terms } = parse(readFileSync(SRC, "utf8"));
  const problems = validate(terms ?? []);
  if (problems.length) {
    console.error(`docs/glossary.yml has ${problems.length} problem(s):\n- ${problems.join("\n- ")}`);
    process.exit(1);
  }
  writeFileSync(OUT, render(terms));
  console.log(`wrote ${path.relative(process.cwd(), OUT)} (${terms.length} terms)`);
}
