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

export type Segment = string | { id: string; text: string; plural: boolean };

/** Split text into plain strings and glossary terms (whole words only). */
export function segmentText(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(TERM_PATTERN)) {
    const f = BY_FORM.get(m[1]!);
    if (!f) continue;
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push({ id: f.id, text: m[1]!, plural: f.plural });
    last = m.index + m[1]!.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Abbreviations the lint requires a <Term> for (Rule 1 terms with a short form). */
export const ABBREVIATIONS = GLOSSARY.filter((t) => t.category === "keep_abbreviation" && t.abbreviation && !selfNamed(t))
  .map((t) => t.abbreviation as string);
