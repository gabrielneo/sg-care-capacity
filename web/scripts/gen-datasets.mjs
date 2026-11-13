#!/usr/bin/env node
// Generate lib/datasets.generated.ts from ../docs/datasets.yml (the freshness rules the pipeline reads too).
// Run: npm run gen:datasets   (CI: npm run check:datasets fails if the committed file is stale)
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, "../../docs/datasets.yml");
const OUT = path.resolve(here, "../lib/datasets.generated.ts");
const CADENCES = ["weekly", "yearly", "irregular", "moment"];
const FIELDS = ["label", "publisher", "cadence", "due_after", "overdue_after", "inherits"];

const span = (s) => s && typeof s === "object" && Object.keys(s).length === 1
  && (Number.isInteger(s.days) || Number.isInteger(s.months)) && (s.days ?? s.months) > 0;
const days = (s) => s.days ?? s.months * 30.44;

export function validate(datasets) {
  const problems = [];
  for (const [id, d] of Object.entries(datasets ?? {})) {
    if (!/^[a-z][a-z0-9_]*$/.test(id)) problems.push(`${id}: id must be lower_snake_case`);
    if (!d?.label || !d?.publisher) problems.push(`${id}: label and publisher are required`);
    if (!CADENCES.includes(d?.cadence)) problems.push(`${id}: cadence must be one of ${CADENCES.join(", ")}`);
    for (const k of Object.keys(d ?? {})) if (!FIELDS.includes(k)) problems.push(`${id}: unknown field ${k}`);
    if (d?.inherits === true) {
      if (d.due_after || d.overdue_after) problems.push(`${id}: a dataset that inherits has no limits of its own`);
      continue;
    }
    if (!span(d?.due_after) || !span(d?.overdue_after)) problems.push(`${id}: due_after and overdue_after must be {days: n} or {months: n}`);
    else if (days(d.overdue_after) <= days(d.due_after)) problems.push(`${id}: overdue_after must be longer than due_after`);
  }
  return problems;
}

export function render(datasets) {
  const body = JSON.stringify(Object.fromEntries(Object.entries(datasets).map(([id, d]) => [id, {
    label: d.label, publisher: d.publisher, cadence: d.cadence,
    ...(d.inherits ? { inherits: true } : { due_after: d.due_after, overdue_after: d.overdue_after }),
  }])), null, 2);
  return `// GENERATED from docs/datasets.yml by scripts/gen-datasets.mjs. Do not edit; run npm run gen:datasets.
export type DatasetCadence = "weekly" | "yearly" | "irregular" | "moment";

export interface Span {
  days?: number;
  months?: number;
}

export interface DatasetRule {
  label: string;
  publisher: string;
  cadence: DatasetCadence;
  due_after?: Span;
  overdue_after?: Span;
  inherits?: true;
}

export const DATASETS: Record<string, DatasetRule> = ${body};
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { datasets } = parse(readFileSync(SRC, "utf8"));
  const problems = validate(datasets);
  if (problems.length) {
    console.error(`docs/datasets.yml has ${problems.length} problem(s):\n- ${problems.join("\n- ")}`);
    process.exit(1);
  }
  writeFileSync(OUT, render(datasets));
  console.log(`wrote ${path.relative(process.cwd(), OUT)} (${Object.keys(datasets).length} datasets)`);
}
