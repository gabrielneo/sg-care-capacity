# 0008: Decide a glossary term's first use on the server

**Status:** Accepted · **Date:** 2026-11-10

## Context

The language rules spell an abbreviation out on its first use on a page ("Changi General Hospital
(CGH)") and show it short after that. Each `<Term>` was a client component. It claimed "first use"
from a shared scope in the order it rendered.

With search results shown, the new home page threw React error #418 (hydration mismatch) on the
real data. The cause:

- While turning the page into HTML, React can pause one part of the page and render later parts
  first. On the server, a later "CGH" (in the heatmap) claimed first use before the status card's.
- The browser hydrates in page order, so it gave first use to the status card.
- The text differed, so React discarded the server HTML.

The output was the same on every request: the order depends on how the page's data is split, not
on timing. Smaller pages happened not to hit it.

## Decision

- **`Term` is a server component.** It claims first use from a per-request scope
  (`lib/termScope.ts`, React `cache`). It passes the answer as a `first` prop to `TermView`, a client
  component that only draws the term and its tooltip. The browser never decides again, so the server
  HTML and the browser always agree.
- **Client components use `ClientTerm` / `ClientGlossed`.** They never spell a term out, because
  the browser can't see the server's scope. They appear only on pages whose text has already spelled
  the term out (the maps and their legends).
- **The footer is `standalone`:** always spelled out, and it doesn't use up the page's first use.
- **Status cards always give the full hospital name**, because cards are read in any order.

## Alternatives considered

- **Let the browser adopt the server's choice while hydrating.** A smaller change, but where the
  server's order was off, the spelled-out form would stay on a later use.
- **Stop repeating terms on the home page.** It fixes one page, and leaves the bug for the next long one.

## Consequences

- React's server renderer may still put a large part of the page off until later, so on long pages
  the spelled-out form can land on a later use than the very first. It is always consistent, never
  an error.
- `lib/termScope.ts` imports `server-only`: a client component that imports `Term` or `Glossed`
  fails the build, rather than spelling every term out silently.

## How it is enforced

- `web/components/terms/Term.test.tsx`: the view renders exactly what it is told; client terms never
  spell out; standalone terms don't use up the page's first use.
- `web/e2e/terms.spec.ts`: "no console or hydration errors" on every page, including searches.
