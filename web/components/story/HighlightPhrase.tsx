import type { ReactNode } from "react";

/**
 * A marker underline under a key phrase. Static: it is part of the server HTML and never animates
 * or waits for scroll (audit D9). A phrase that wraps keeps one mark, under its last line.
 */
export function HighlightPhrase({ children }: { children: ReactNode }) {
  return <span className="highlight" data-testid="highlight">{children}</span>;
}
