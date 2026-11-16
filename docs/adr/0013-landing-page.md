# 0013: A landing page at "/"; the clinic finder and the views move to /find

**Status:** Accepted · **Date:** 2026-11-16

*Replaces, in part, [0011](0011-public-view.md) (the red triage band) and [0007](0007-public-home-page.md) (the public page at `/`).*

## Context

The owner's review of the "calm & clear" redesign found the site still said too much and showed too little. `/` was the clinic
finder, under a red 995 banner, so a first-time reader met a clinic search before the project's own subject: how long bed waits are
and where seniors have the fewest clinics. Several controls and links also looked decorative rather than useful: a light, dark and
auto theme switch; cards that were one big link, so a hover underlined every line; a map that ignored the scroll wheel and the
trackpad pinch.

## Decision

- **`/` is a landing page.** A short claim and two ways on, then two pictures, each with one short note, then three cards. The
  pictures are the bed waits of each hospital against its own usual level, and clinics per senior by planning area. Every figure and
  note is computed from the API: the engine's own headline, or a count of what is drawn. A picture that cannot be drawn shows an
  error block, never a stand-in, and the note under the bed-wait picture appears only when the engine has a finding about that
  picture.
- **The map on the landing page is plain SVG**, built on the server from the SVY21 geometry (`lib/staticMap.ts`). It has no Leaflet,
  no tiles and no script, so the page stays light and works without JavaScript. Shade is never the only cue: every area is named in
  its tooltip, an unranked area is hatched and counted in the legend, and the table is one link away.
- **The finder and the three views are at `/find`** (`/find?view=planner`, `/find?view=analyst`). An old `/?view=…`, `?sort=`,
  `?cluster=`, `?layout=` or `?hospital=` address is redirected there; other parameters stay on the landing page.
- **No 995 banner.** The emergency number is in the footer of every page and the phone menu, and Planner and Analyst keep their
  one-line note. The "not medical advice" line stays on the landing page and the finder.
- **No theme switch.** The site follows the device's light or dark setting. Both palettes stay, so dark-mode contrast is still
  tested. A theme saved by the old switch is ignored.
- **Links underline only their own words.** A card's title is its link; its description and figure are plain text.
- **The home map zooms** by the scroll wheel and by a two-finger trackpad pinch.

## Alternatives considered

- **Keep the finder at `/` and add the landing page at `/welcome`.** Less to move, but nobody lands on it, which defeats the point.
- **Keep the banner, make it smaller.** The owner asked for it gone; the footer and menu already carry the number on every page.
- **Keep the theme switch and hide it in a menu.** A control nobody needs is still a control.
- **A Leaflet map on the landing page.** It would bring Leaflet and a map-tile request to the first screen of the site.

## Consequences

- Every address, test and screenshot that meant "the finder" had to move to `/find`.
- Print of the Public view no longer carries a 995 line; the footer is hidden in print. Planner and Analyst keep theirs.
- The hero heading is the site's largest size (36px at 640px and up). The type budget (six sizes) rules out a bigger one.
- Largest Contentful Paint is 2.33 s on every page, the framework's floor (React and the Next.js router are 72% of the 153 kB of
  script), not something the landing page adds.

## How it is enforced

- `e2e/landing.spec.ts`: one heading, both buttons on the first screen, no red banner, a note from the data, the SVG map with a
  name on every area and no Leaflet, title-only cards, no sideways scroll at 375, 768, 1280 and 1440 px, axe at WCAG 2.2 AA, and the
  old-address redirect.
- `e2e/theme.spec.ts`: no theme control, nothing forced on `<html>`, a saved choice ignored.
- `e2e/care-map.spec.ts`: wheel and Ctrl+wheel zoom the map without scrolling the page.
- `e2e/hubs.spec.ts`, `components/landing/LandingMap.test.tsx`, `lib/staticMap.test.ts`.
