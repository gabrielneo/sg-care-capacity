"use client";

import { usePathname } from "next/navigation";
import { createContext, type ReactNode, useContext, useMemo } from "react";

/**
 * Tracks which glossary terms a page has already used, so only the first use is spelled out.
 * One scope per page (reset when the path changes); no global state.
 *
 * Each <Term> claims its id with its own useId(). The id is stable across server rendering,
 * hydration and React's strict-mode double render, so a Term that claimed first use keeps it.
 */
export interface TermScopeValue {
  claim(termId: string, instanceId: string): boolean;
}

const TermContext = createContext<TermScopeValue | null>(null);

export function createScope(): TermScopeValue {
  const firsts = new Map<string, string>();
  return {
    claim(termId, instanceId) {
      if (!firsts.has(termId)) firsts.set(termId, instanceId);
      return firsts.get(termId) === instanceId;
    },
  };
}

export function TermScope({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // A new scope for every page.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const scope = useMemo(() => createScope(), [pathname]);
  return <TermContext.Provider value={scope}>{children}</TermContext.Provider>;
}

/** For tests and isolated renders: a scope that isn't tied to the router. */
export function StaticTermScope({ children }: { children: ReactNode }) {
  const scope = useMemo(() => createScope(), []);
  return <TermContext.Provider value={scope}>{children}</TermContext.Provider>;
}

const NO_SCOPE: TermScopeValue = { claim: () => true };

/** Outside a scope every use counts as first (spelled out): never an unexplained abbreviation. */
export function useTermScope(): TermScopeValue {
  return useContext(TermContext) ?? NO_SCOPE;
}
