import { Children, isValidElement, type ReactNode } from "react";

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
             className={`section ${tone === "band" ? "section-band" : ""} ${className}`}>
      {heading ? <h2 id={headingId} className="mb-4 max-w-prose font-semibold text-ink text-h2">{heading}</h2> : null}
      {children}
    </section>
  );
}

/** A run of sections that alternate between band and page, however many of them actually render (null children are skipped). */
export function Chapters({ first = "band", children }: { first?: "page" | "band"; children: ReactNode }) {
  const items = Children.toArray(children);
  const other = first === "band" ? "page" : "band";
  return <>{items.map((child, i) => <Section key={isValidElement(child) && child.key != null ? child.key : i} tone={i % 2 === 0 ? first : other}>{child}</Section>)}</>;
}
