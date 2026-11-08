/**
 * Readability (docs/language_rules.md, Rule 6): Flesch-Kincaid grade for the Overview text and the
 * case study's prose. Reported on every run; a grade above 10 is a warning, never a failure.
 * Run alone with `npm run readability` (also part of `npm run lint`).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { BED_WAIT_EXPLAINER, CAVEAT } from "@/lib/copy";
import { storySample } from "@/lib/samples";

import { fleschKincaid, proseFromMarkdown, sentences, syllables } from "../scripts/text-tools.mjs";

const WARN_ABOVE = 10;

describe("Flesch-Kincaid", () => {
  it.each([["the", 1], ["hospital", 3], ["emergency", 4], ["available", 4], ["ministry", 3], ["made", 1], ["2026", 1]])(
    "%s has %i syllable(s)", (w, n) => expect(syllables(w)).toBe(n));

  it("matches the formula on reference sentences", () => {
    expect(fleschKincaid("The cat sat on the mat.").grade).toBeCloseTo(-1.5, 0);         // 6 words, 6 syllables
    const hard = fleschKincaid("Interdisciplinary epidemiological considerations necessitate comprehensive reorganisation.");
    expect(hard.grade).toBeGreaterThan(20);
    expect(sentences("One. Two words here. 3 more.")).toHaveLength(3);
  });

  it("reads Markdown prose only: no code, tables, headings or TODO(me) placeholders", () => {
    const prose = proseFromMarkdown("# Title\n\nA real sentence.\n\n| a | b |\n\n```\ncode here.\n```\n\nTODO(me): later.\n\n- An item.\n");
    expect(prose.map((p) => p.text)).toEqual(["A real sentence.", "An item."]);
  });
});

function report(name: string, text: string) {
  const r = fleschKincaid(text);
  const line = `Readability: ${name} is grade ${r.grade} (${r.words} words, ${r.sentences} sentences; Rule 6 aims for 8-9)`;
  if (r.grade > WARN_ABOVE) console.warn(`WARN ${line}: above grade ${WARN_ABOVE}`);
  else console.log(line);
  return r;
}

describe("readability report", () => {
  it("Overview", () => {
    // The story's text: the engine's headlines, details, labels and first caveats (data-2026-11-08),
    // and the site's own sentences around them.
    const sentence = (t: string) => (/[.!?]$/.test(t) ? t : `${t}.`);
    const text = [
      ...storySample.flatMap((i) => [i.headline, i.detail, sentence(i.display.metric_label), sentence(i.caveats[0] ?? "")]),
      BED_WAIT_EXPLAINER, CAVEAT.population,
    ].join(" ");
    expect(report("Overview", text).sentences).toBeGreaterThan(3);
  });

  it("Case Study", () => {
    const md = readFileSync(path.resolve(__dirname, "../../docs/case_study.md"), "utf8");
    const text = proseFromMarkdown(md).map((p) => p.text).join(" ");
    expect(report("Case Study (prose, excluding TODO(me) placeholders)", text).words).toBeGreaterThan(100);
  });
});
