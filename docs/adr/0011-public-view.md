# 0011: The public view leads with a triage band and a clinic finder; EDs are context

**Status:** Accepted · **Date:** 2026-11-12

## Context

The site's thesis is right-siting: when it is safe to, care is best given in the most suitable place,
such as a GP clinic or polyclinic rather than an emergency department (ED). The public view
([0010](0010-home-page-views.md)) opened with a status card for every ED, which put ED busyness first
and ranked all nine hospitals for someone who may only need a clinic. It also ran the postcode search
on the server: the postcode was in the address (`/?near=...`), so it reached our host and could appear
in its request logs, while the page said it stayed private and the project's rule is that the search
stays in the browser.

## Decision

- **A triage band comes first**, can't be dismissed and is the page's highest-contrast block: "Life-threatening
  emergency? Call 995." with a call link, one line saying a GP clinic or polyclinic can often help
  when it isn't life-threatening, and a link to the official guidance. The site gives no other medical
  advice. The guidance URL is `TRIAGE_GUIDANCE_URL` in `web/lib/copy.ts`, a `TODO(me)`: no link is
  shown until the author sets it. "Not medical advice" stays on every view.
- **The search runs in the browser.** The place lists come from `/places.json`, fetched once and only when
  a search starts; the request has no search text in it. Matching and distances run in the page. The
  search is kept in the address's fragment (`#near=460123&type=gp`), which a browser never sends to a
  server, so a link can still be shared and back and forward work. There is no no-JavaScript search:
  the old form would have sent the postcode to the server, and a page that replaces its results needs
  scripting to announce them.
- **Results are cards:** name, type ("GP clinic on CHAS" or "Polyclinic"), address, the straight-line
  distance (labelled so; no routing or travel time exists in the data), and a Directions link to an
  external map app. The link has the place's coordinates only: not what was typed, not where the person is.
  The first card says "Nearest"; the site never says "fastest".
- **Filters only for fields that exist:** GP clinics or polyclinics. There is no "open now" (no opening
  hours in the data) and no CHAS filter (every clinic listed is on CHAS).
- **The nearest three EDs follow the search**, as plain cards: "Busier than usual for this hospital" (the
  badge's own level, in words), the bed wait under its full label with a "?" saying it is not the time to
  see a doctor, coverage notes (urgent care centre, adults only) and, only where NUHS publishes one, "To
  see a doctor (NUHS estimate)" with its own time. The section is called "How busy were EDs near you
  last week?", because the figures are last week's. Before a search it asks for one rather than ranking
  all nine hospitals. The full list and the statistics are on Planner and Analyst.
- **Size and access:** body text is at least 16px and dates, sources and chips at least 14px; every
  control is at least 44px tall; results are announced through a polite live region.

## Alternatives considered

- **Keep the server-side search and `?near=`.** Works without JavaScript and keeps the old tests, but
  the postcode reaches the host's logs, which the project's own rule rules out.
- **Search text in a cookie or local storage.** Not shareable, and storing it is what the page says it doesn't do.
- **Always show the nine hospital cards.** Simple, but it leads with ED busyness for people who came to
  find a clinic, and ranks hospitals as if they were choices.
- **"How busy are EDs near you?"** Reads as live. The figures are the latest complete week, up to 12 days old.

## Consequences

- Public needs JavaScript for the search. The emergency band, the "not medical advice" line and the
  definitions are plain HTML.
- Next.js may put the fragment back on the address when a view is changed and then returned to; it
  stays in the browser either way.
- The `plain` words are a second wording for the same level, not a second scale.

## How it is enforced

- `web/lib/finder.test.ts`: distance order, ties, filters, the directions link and the live-region text.
- `web/lib/finderStore.test.ts`: the search is in the fragment only, and `/places.json` is asked for once with no search text.
- `web/components/home/finder.test.tsx`: badge on the first card only, labels ("wait time" never appears), the NUHS estimate's label and time, the triage band.
- `web/e2e/finder.spec.ts`: postcode, then places by distance, then ED cards; no request contains the postcode; keyboard use, 16px text, 44px targets; axe (WCAG 2.2 AA) and no sideways scrolling at 375, 768 and 1280 px.
