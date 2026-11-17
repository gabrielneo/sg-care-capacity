/** Glossary lookups and the text splitter behind <Glossed> and the docs renderer. */
import { GLOSSARY, type GlossaryEntry, type GlossaryId } from "./glossary.generated";

export type { GlossaryEntry, GlossaryId };
export { GLOSSARY };

export const GLOSSARY_BY_ID: Record<string, GlossaryEntry> = Object.fromEntries(GLOSSARY.map((t) => [t.id, t]));

export function term(id: string): GlossaryEntry {
  const t = GLOSSARY_BY_ID[id];
  if (!t) throw new Error(`unknown glossary term "${id}"`);
  return t;
}

/** A term with no separate full name (SingHealth, polyclinic) explains itself on every use. */
export const selfNamed = (t: GlossaryEntry) => t.abbreviation !== null && t.abbreviation.toLowerCase() === t.full_name.toLowerCase();

/** What the first use on a page reads. */
export function firstUseText(t: GlossaryEntry, plural = false): string {
  if (t.category !== "keep_abbreviation" || selfNamed(t)) return t.full_name;
  return `${t.full_name}${plural ? "s" : ""} (${t.abbreviation}${plural ? "s" : ""})`;
}

/** Forms matched in running text: abbreviations (and "EDs"), plus listed aliases. Never technical_only. */
const FORMS: { form: string; id: string; plural: boolean }[] = GLOSSARY.flatMap((t) => {
  if (t.category === "technical_only") return [];
  const forms: { form: string; id: string; plural: boolean }[] = [];
  if (t.abbreviation) {
    forms.push({ form: t.abbreviation, id: t.id, plural: false });
    if (/^[A-Z]{2,}$/.test(t.abbreviation)) forms.push({ form: `${t.abbreviation}s`, id: t.id, plural: true });
  }
  for (const a of t.aliases) forms.push({ form: a, id: t.id, plural: false });
  return forms;
}).sort((a, b) => b.form.length - a.form.length);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const TERM_PATTERN = new RegExp(`(?<![\\w-])(${FORMS.map((f) => escape(f.form)).join("|")})(?![\\w-])`, "g");
const BY_FORM = new Map(FORMS.map((f) => [f.form, f]));

export type Segment = string | { id: string; text: string; plural: boolean; spelled?: boolean };

/** "Urgent Care Centre (" right before an abbreviation: the text already spells it out. */
function spelledBefore(before: string, id: string, plural: boolean): number {
  const t = GLOSSARY_BY_ID[id];
  if (!t || t.category !== "keep_abbreviation" || selfNamed(t)) return -1;
  const m = before.match(new RegExp(`(?<![\\w-])${escape(t.full_name)}${plural ? "s?" : ""}\\s*\\($`, "i"));
  return m ? m.index! : -1;
}

/**
 * Split text into plain strings and glossary terms (whole words only). Where the text already reads "Full name (ABBR)", the whole
 * phrase is one term marked `spelled`, so it is never spelled out a second time ("Urgent Care Centre (Urgent Care Centre (UCC))").
 */
export function segmentText(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(TERM_PATTERN)) {
    if (m.index < last) continue;
    const f = BY_FORM.get(m[1]!);
    if (!f) continue;
    const before = text.slice(last, m.index);
    const end = m.index + m[1]!.length;
    const from = text[end] === ")" ? spelledBefore(before, f.id, f.plural) : -1;
    if (from >= 0) {
      if (from > 0) out.push(before.slice(0, from));
      out.push({ id: f.id, text: text.slice(last + from, end + 1), plural: f.plural, spelled: true });
      last = end + 1;
      continue;
    }
    if (m.index > last) out.push(before);
    out.push({ id: f.id, text: m[1]!, plural: f.plural });
    last = end;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Abbreviations the lint requires a <Term> for (Rule 1 terms with a short form). */
export const ABBREVIATIONS = GLOSSARY.filter((t) => t.category === "keep_abbreviation" && t.abbreviation && !selfNamed(t))
  .map((t) => t.abbreviation as string);
