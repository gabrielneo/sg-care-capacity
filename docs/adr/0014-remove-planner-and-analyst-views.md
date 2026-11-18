# 0014: Remove the Planner and Analyst views; /find is the clinic finder only

**Status:** Accepted · **Date:** 2026-11-18

*Supersedes [0010](0010-home-page-views.md) (one page with three views, chosen in the URL) and the parts of
[0013](0013-landing-page.md) that kept the Planner and Analyst views at `/find`.*

## Context

Since the landing page ([0013](0013-landing-page.md)), the weekly figures have a home of their own: the landing page's two
pictures, ED Trends, the findings and the one-page summary. The Planner and Analyst views at `/find?view=…` still showed the
same weekly figures again, in the dashboard style of the site before the redesign: a summary strip, hospital cards, a sticky
status strip, takeaways and a weekday heatmap. The owner found that a "weekly summary" link on the Findings and Case study pages
led to the Planner view, which reads as an older version of the site, under a heading that never said "weekly summary".

## Decision

- **`/find` is the clinic finder only:** the search, the nearest three emergency departments, the map with its hospital list and
  details, and how the figures are made. There is no view switch in the header or the phone menu.
- **Old links still work.** `/find?view=planner` and `/find?view=analyst` (and `/?view=…`, through the landing page) go to
  `/find`, keeping the map's own state in the address (`?sort=`, `?layout=`, `?cluster=`, `?hospital=`).
- **"Weekly summary" becomes "one-page summary"** and links to `/summary`, which is what the note describes.
- **The nearest-ED section's last link** goes to ED Trends ("See every hospital's bed waits over time"), not to the Analyst view.
- **Code that only the two views used is deleted**, with its tests: the view list and switch, the summary strip, the status cards
  and grid, the site strip, the takeaways, the weekday-pattern section, "What changed", the phone accordions, and their styles.

## Alternatives considered

- **Keep the views and only fix the link.** Smallest change, but the views duplicated pages the site already has, and the owner
  judged them out of date.
- **Keep the Analyst view only.** Its unique parts (the weekday heatmap, the statistics behind each finding) are already on ED
  Trends and the findings page.

## Consequences

- One less layout to keep consistent; the header row is the wordmark and the five sections.
- The project and About pages no longer claim "one site for three readers"; they say what the site has: a public clinic finder,
  data pages and a one-page summary.
- Lighthouse CI no longer measures `/find?view=planner`; it measures `/find`.

## How it is enforced

- `e2e/frame.spec.ts`: an old `/find?view=planner` link lands on `/find`; the phone menu has no view choice.
- `e2e/landing.spec.ts`: an old `/?view=planner&sort=hours` address lands on `/find?sort=hours`.
- `e2e/reading-aids.spec.ts`: the finder's sections, in order: notice, finder, nearest EDs, map, methods.
- `components/FigureCadenceNote.test.tsx`: the note links to `/summary`.
