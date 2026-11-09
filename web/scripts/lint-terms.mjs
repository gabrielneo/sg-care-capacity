#!/usr/bin/env node
// Terminology lint (docs/language_rules.md), run by `npm run lint` and in CI.
//  FAIL  a glossary abbreviation in page text that isn't inside <Term> or <Glossed>
//  FAIL  a database column name (snake_case property in api/openapi.json) in page text
//  WARN  a sentence over 25 words in a doc that renders on a public page
// "Page text" = JSX text and user-facing props (title, label, caveat, ...) in public pages and
// components, and the site's own copy modules. Text from the API is checked on the rendered
// pages by Playwright (e2e/terms.spec.ts).
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { parse } from "yaml";

import { proseFromMarkdown, sentences, words } from "./text-tools.mjs";

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.resolve(WEB, "..");
const USER_PROPS = new Set(["title", "label", "description", "caveat", "message", "intro", "aria-label", "placeholder", "alt", "summary"]);
const WRAPPERS = new Set(["Term", "Glossed", "ClientTerm", "ClientGlossed"]);
// The nav is site chrome; the glossary page shows terms as definitions; /dev is not public.
const EXEMPT = [/^app\/dev\//, /^app\/glossary\//, /^components\/Nav\.tsx$/, /^components\/terms\//, /\.test\.tsx?$/];
const COPY_MODULES = ["lib/copy.ts", "lib/story.ts"];
const PUBLIC_DOCS = ["case_study.md", "methodology.md"];
const MAX_WORDS = 25;

const glossary = parse(readFileSync(path.join(ROOT, "docs/glossary.yml"), "utf8")).terms;
const abbreviations = glossary
  .filter((t) => t.category === "keep_abbreviation" && t.abbreviation && t.abbreviation.toLowerCase() !== t.full_name.toLowerCase())
  .map((t) => t.abbreviation);
const ABBR = new RegExp(`(?<![\\w-])(${abbreviations.map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})s?(?![\\w-])`);

const openapi = JSON.parse(readFileSync(path.join(ROOT, "api/openapi.json"), "utf8"));
const columns = [...new Set(Object.values(openapi.components.schemas).flatMap((s) => Object.keys(s.properties ?? {})))]
  .filter((n) => n.includes("_")).sort();
const COLUMN = new RegExp(`\\b(${columns.join("|")})\\b`);

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? files(p) : [p];
  });
}

const errors = [];
const report = (file, node, sf, msg) => {
  const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
  errors.push(`${file}:${line + 1}  ${msg}`);
};

function insideWrapper(node) {
  for (let n = node.parent; n; n = n.parent) {
    if (ts.isJsxElement(n) && WRAPPERS.has(n.openingElement.tagName.getText())) return true;
    if (ts.isJsxSelfClosingElement(n) && WRAPPERS.has(n.tagName.getText())) return true;
  }
  return false;
}

function check(file, sf, node, text, { abbr = true } = {}) {
  const a = abbr && !insideWrapper(node) ? text.match(ABBR) : null;
  if (a) report(file, node, sf, `"${a[1]}" outside <Term>/<Glossed>: "${text.trim().slice(0, 70)}"`);
  const c = text.match(COLUMN);
  if (c) report(file, node, sf, `database column name "${c[1]}" in page text: "${text.trim().slice(0, 70)}"`);
}

const literalText = (n) =>
  ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) ? n.text
    : ts.isTemplateExpression(n) ? [n.head.text, ...n.templateSpans.map((s) => s.literal.text)].join(" ") : null;

for (const abs of [...files(path.join(WEB, "app")), ...files(path.join(WEB, "components"))].filter((f) => f.endsWith(".tsx"))) {
  const file = path.relative(WEB, abs);
  // Loading screens render before the page while it streams, so a <Term> there would take the
  // page's first use on the server but not in the browser (a hydration mismatch). Plain words only.
  if (/(^|\/)loading\.tsx$/.test(file) && /<(Term|Glossed)\b/.test(readFileSync(abs, "utf8"))) {
    errors.push(`${file}  loading screens must not use <Term> or <Glossed>: write the words out`);
  }
  if (EXEMPT.some((r) => r.test(file))) continue;
  const sf = ts.createSourceFile(abs, readFileSync(abs, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const visit = (node) => {
    if (ts.isJsxText(node) && node.text.trim()) check(file, sf, node, node.text);
    if (ts.isJsxAttribute(node) && node.initializer) {
      const name = node.name.getText();
      const tag = node.parent.parent;
      const tagName = ts.isJsxOpeningElement(tag) || ts.isJsxSelfClosingElement(tag) ? tag.tagName.getText() : "";
      if (USER_PROPS.has(name) && !(WRAPPERS.has(tagName))) {
        const init = ts.isJsxExpression(node.initializer) ? node.initializer.expression : node.initializer;
        const text = init && literalText(init);
        if (text) check(file, sf, node, text);
      }
    }
    if (ts.isJsxExpression(node) && node.expression && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      const text = literalText(node.expression);
      if (text) check(file, sf, node, text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

// The site's own copy: rendered through <Glossed>, so abbreviations are fine; column names are not.
for (const rel of COPY_MODULES) {
  const abs = path.join(WEB, rel);
  const sf = ts.createSourceFile(abs, readFileSync(abs, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const visit = (node) => {
    const text = literalText(node);
    // Object keys and lookups are code, not text: only check literals with a space (sentences, labels).
    if (text && /\s/.test(text) && !ts.isPropertyAssignment(node.parent) || (text && ts.isPropertyAssignment(node.parent) && node.parent.initializer === node && /\s/.test(text))) {
      check(rel, sf, node, text, { abbr: false });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

// Warnings: long sentences in docs that render on public pages.
const warnings = [];
for (const doc of PUBLIC_DOCS) {
  for (const p of proseFromMarkdown(readFileSync(path.join(ROOT, "docs", doc), "utf8"))) {
    for (const s of sentences(p.text)) {
      const n = words(s).length;
      if (n > MAX_WORDS) warnings.push(`docs/${doc}:${p.line}  ${n} words: "${s.slice(0, 80)}${s.length > 80 ? "…" : ""}"`);
    }
  }
}

if (warnings.length) {
  console.warn(`terminology lint: ${warnings.length} sentence(s) over ${MAX_WORDS} words in public docs (warning):`);
  for (const w of warnings) console.warn(`  WARN ${w}`);
}
if (errors.length) {
  console.error(`terminology lint: ${errors.length} error(s):`);
  for (const e of errors) console.error(`  FAIL ${e}`);
  process.exit(1);
}
console.log(`terminology lint: ok (${abbreviations.length} abbreviations, ${columns.length} column names checked)`);
