import type { ReactNode } from "react";

/**
 * A page section. "band" sits on the band colour and runs the full width of the window; the content stays
 * in the page container. Long pages alternate page, band, page so each section reads as a chapter.
 * Give it a `heading` that states the one question it answers.
 */
export function Section({ tone = "page", heading, id, children, className = "" }: {
  tone?: "page" | "band"; heading?: ReactNode; id?: string; children: ReactNode; className?: string;
}) {
  const headingId = id && heading ? `${id}-heading` : undefined;
  return (
    <section id={id} aria-labelledby={headingId} data-tone={tone} data-testid="section"
             className={`section py-8 sm:py-12 ${tone === "band" ? "section-band" : ""} ${className}`}>
      {heading ? <h2 id={headingId} className="mb-4 max-w-prose text-xl font-semibold tracking-tight text-ink sm:text-2xl">{heading}</h2> : null}
      {children}
    </section>
  );
}
