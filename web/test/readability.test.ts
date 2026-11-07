/**
 * Readability (docs/language_rules.md, Rule 6): Flesch-Kincaid grade for the Overview text and the
 * case study's prose. Reported on every run; a grade above 10 is a warning, never a failure.
 * Run alone with `npm run readability` (also part of `npm run lint`).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { EdSummary } from "@/lib/api/types";
import { BED_WAIT_EXPLAINER } from "@/lib/copy";
import { formatWeek, summaryParagraph, weekKpis } from "@/lib/summary";

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
    const row = (code: string, name: string, wait: number, base: number, att: number, attBase: number): EdSummary => ({
      hospital_code: code, hospital_name: name, facility_type: code === "AH" ? "UCC" : "ED",
      latest_complete_week: { iso_year: 2026, iso_week: 43, week_start: "2026-10-19", week_end: "2026-10-25" }, is_current: true,
      baseline_weeks: ["2026-09-21"], note: null,
      mean_of_daily_median_wait_hours: { unit: "hours", latest: wait, baseline_mean: base, change: wait - base, change_pct: ((wait - base) / base) * 100 },
      total_attendances: { unit: "patients", latest: att, baseline_mean: attBase, change: att - attBase, change_pct: ((att - attBase) / attBase) * 100 },
    });
    const k = weekKpis([row("AH", "Alexandra Hospital (UCC)", 2.1, 1.6, 1100, 1060), row("SGH", "Singapore General Hospital", 7.8, 8.3, 3400, 3510),
                        row("CGH", "Changi General Hospital", 3.4, 3.6, 3600, 3540)]);
    const text = [
      `The latest complete week published by MOH: ${formatWeek(k.week!)}. A week is complete when all 7 days have both figures.`,
      summaryParagraph(k),
      `Hours, average of each day's median, for the week of ${formatWeek(k.week!)}.`,
      BED_WAIT_EXPLAINER,
    ].join(" ");
    expect(report("Overview", text).sentences).toBeGreaterThan(3);
  });

  it("Case Study", () => {
    const md = readFileSync(path.resolve(__dirname, "../../docs/case_study.md"), "utf8");
    const text = proseFromMarkdown(md).map((p) => p.text).join(" ");
    expect(report("Case Study (prose, excluding TODO(me) placeholders)", text).words).toBeGreaterThan(100);
  });
});
