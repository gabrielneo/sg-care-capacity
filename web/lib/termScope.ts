/**
 * Which glossary terms a page has already used, so only the first use is spelled out
 * (docs/language_rules.md, Rules 1 and 2).
 *
 * Decided on the server, in React Server Component order, once per request (React `cache`):
 * server components render in page order, and the decision travels to the browser as a prop, so
 * the server HTML and the browser always agree. (Until 2026-11-09 each <Term> claimed first use
 * while rendering to HTML, where React may render later sections first: the server and the
 * browser then disagreed about which use was first, and React threw a hydration error, #418.)
 */
import "server-only";

import { cache } from "react";

export interface TermScopeValue {
  /** True for the first claim of `termId` in this scope; `token` identifies the claiming use. */
  claim(termId: string, token: object): boolean;
}

export function createScope(): TermScopeValue {
  const firsts = new Map<string, object>();
  return {
    claim(termId, token) {
      if (!firsts.has(termId)) firsts.set(termId, token);
      return firsts.get(termId) === token;
    },
  };
}

// One scope per request. On a client navigation the new page is a new request, so a new scope.
const requestScope = cache(createScope);

let testScope: TermScopeValue | null = null;

/** Unit tests render outside a server request: they set a scope for the tree they render. */
export function setTestScope(scope: TermScopeValue | null): void {
  testScope = scope;
}

export function pageScope(): TermScopeValue {
  return testScope ?? requestScope();
}
