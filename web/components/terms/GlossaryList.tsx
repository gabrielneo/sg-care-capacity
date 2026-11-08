"use client";

import { useId, useMemo, useState } from "react";

import { firstUseText, type GlossaryEntry, selfNamed } from "@/lib/glossary";

const GROUPS: { category: GlossaryEntry["category"]; title: string; intro: string }[] = [
  { category: "keep_abbreviation", title: "Abbreviations we keep",
    intro: "Spelled out the first time they appear on a page, then shown short with this definition on hover, focus or tap." },
  { category: "keep_and_explain", title: "Words we explain",
    intro: "These carry the argument, so they stay. The first use on a page shows this explanation." },
  { category: "technical_only", title: "Technical terms, and what public pages say instead",
    intro: "Used only on the Methodology and data-quality detail pages." },
];

const heading = (t: GlossaryEntry) => (t.category === "keep_abbreviation" && !selfNamed(t) ? firstUseText(t) : t.full_name);

function matches(t: GlossaryEntry, q: string): boolean {
  if (!q) return true;
  const hay = [t.abbreviation, t.full_name, t.plain_definition, t.public_wording, ...t.aliases].join(" ").toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}

/** Every glossary term, grouped by category, with search. */
export function GlossaryList({ terms }: { terms: readonly GlossaryEntry[] }) {
  const [query, setQuery] = useState("");
  const inputId = useId();
  const shown = useMemo(() => terms.filter((t) => matches(t, query.trim())), [terms, query]);
  return (
    <div>
      <div className="mb-6 max-w-md">
        <label htmlFor={inputId} className="block text-sm font-semibold">Search the glossary</label>
        <input id={inputId} type="search" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off"
               className="mt-1 min-h-11 w-full rounded-md border border-line bg-surface px-3" placeholder="e.g. CHAS, median, bed wait" />
        <p role="status" aria-live="polite" className="mt-1 text-sm text-muted" data-testid="glossary-count">
          {query.trim() ? `${shown.length} of ${terms.length} terms match` : `${terms.length} terms`}
        </p>
      </div>
      {shown.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line bg-surface p-4 text-sm">No term matches &ldquo;{query}&rdquo;.</p>
      ) : null}
      {GROUPS.map((g) => {
        const items = shown.filter((t) => t.category === g.category);
        if (!items.length) return null;
        return (
          <section key={g.category} aria-labelledby={`g-${g.category}`} className="mb-8" data-testid={`glossary-${g.category}`}>
            <h2 id={`g-${g.category}`} className="text-lg font-semibold">{g.title}</h2>
            <p className="mb-3 text-sm text-muted">{g.intro}</p>
            <dl className="divide-y divide-line rounded-lg border border-line bg-surface">
              {items.map((t) => (
                <div key={t.id} id={t.id} className="grid gap-1 p-3 sm:grid-cols-[minmax(0,16rem)_1fr] sm:gap-4">
                  <dt className="font-medium text-ink">{heading(t)}</dt>
                  <dd className="text-sm">
                    {t.pending ? (
                      <span className="todo-me inline-block">{t.plain_definition}</span>
                    ) : (
                      t.plain_definition
                    )}
                    {t.public_wording ? <span className="mt-1 block text-muted">Public pages say: {t.public_wording}</span> : null}
                    {/* Inline, after the definition: on its own line it read as a term with no definition. */}
                    {t.source_url ? <>{" "}<a href={t.source_url} className="text-xs">Source</a></> : null}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}
    </div>
  );
}
