"use client";

import type { ReactNode } from "react";

import { TermView } from "./TermView";

/**
 * A glossary term inside a client component (the maps). The browser can't know the server's
 * first uses, so these never spell a term out: they show the short form with its definition.
 * They only appear on pages whose text has already spelled the term out (checked on the
 * rendered pages by e2e/terms.spec.ts).
 */
export function ClientTerm({ id, children, plural = false, plain = false }: { id: string; children?: ReactNode; plural?: boolean; plain?: boolean }) {
  return <TermView id={id} first={false} plural={plural} plain={plain}>{children}</TermView>;
}
