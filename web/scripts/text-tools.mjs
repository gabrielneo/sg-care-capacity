// Shared text helpers for the terminology lint and the readability report. Plain JS so both
// Node scripts and Vitest can use it.

/** Prose paragraphs of a Markdown file (no code, tables, headings, HTML or TODO(me) placeholders). */
export function proseFromMarkdown(md) {
  const out = [];
  let inCode = false;
  let block = null;
  const flush = () => {
    if (block && !/TODO\(me\)/.test(block.text)) out.push(block);
    block = null;
  };
  md.split("\n").forEach((raw, i) => {
    const line = raw.trim();
    if (line.startsWith("```")) { inCode = !inCode; flush(); return; }
    if (inCode || !line || line.startsWith("|") || line.startsWith("#") || line.startsWith("<")) { flush(); return; }
    const item = /^([-*]|\d+\.)\s+/.test(line);
    if (item) flush();
    const text = line.replace(/^([-*]|\d+\.)\s+/, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[*_`]/g, "");
    if (!block) block = { line: i + 1, text };
    else block.text += ` ${text}`;
  });
  flush();
  return out;
}

export function sentences(text) {
  return text.split(/(?<=[.!?])\s+(?=[A-Z0-9("'])/).map((s) => s.trim()).filter((s) => /[A-Za-z]/.test(s));
}

export const words = (text) => text.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w));

/** Syllables by a common heuristic (vowel groups, silent endings). Numbers count as one. */
export function syllables(word) {
  let w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 1;
  if (w.length <= 3) return 1;
  w = w.replace(/(?:[^laeiouy]es|[^laeiouy]ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  const groups = w.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

/** Flesch-Kincaid grade level: 0.39 (words/sentences) + 11.8 (syllables/words) - 15.59. */
export function fleschKincaid(text) {
  const ss = sentences(text);
  const ws = words(text);
  if (!ss.length || !ws.length) return { grade: 0, sentences: 0, words: 0 };
  const syl = ws.reduce((n, w) => n + syllables(w), 0);
  const grade = 0.39 * (ws.length / ss.length) + 11.8 * (syl / ws.length) - 15.59;
  return { grade: Math.round(grade * 10) / 10, sentences: ss.length, words: ws.length };
}
