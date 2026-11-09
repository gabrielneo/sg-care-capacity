import type { ReactNode } from "react";

import { pageScope } from "@/lib/termScope";

import { TermView } from "./TermView";

export interface TermProps {
  id: string;
  /** Visible text for Rule 2 terms (e.g. "medians"); defaults to the abbreviation or name. */
  children?: ReactNode;
  /** "EDs": the plural of an abbreviation. */
  plural?: boolean;
  /** Inside a link, button, <option> or chart text, where a button isn't allowed: text only. */
  plain?: boolean;
  /** Outside the page's text (the site footer): always spelled out, and doesn't use up the page's first use. */
  standalone?: boolean;
}

/**
 * A glossary term, in a server component. It claims the page's first use here, on the server, in
 * page order (lib/termScope.ts), and hands the answer to TermView. Client components use
 * ClientTerm instead.
 */
export function Term({ id, children, plural = false, plain = false, standalone = false }: TermProps) {
  const first = standalone || pageScope().claim(id, {});
  return <TermView id={id} first={first} plural={plural} plain={plain}>{children}</TermView>;
}
