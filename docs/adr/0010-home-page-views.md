# 0010: One home page with three views, chosen in the URL

**Status:** Accepted · **Date:** 2026-11-11 · The public view was reworked by [0011](0011-public-view.md): the postcode search moved into the browser, and Public shows the nearest three EDs instead of every hospital.

## Context

The home page was rebuilt for residents ([0007](0007-public-home-page.md)): a search, a status card
per emergency department (ED) and a map. The same page still carried the weekday pattern and the
takeaways, which a resident doesn't need, and it gave a planner no summary to start from. The site
has three kinds of reader, and they want different amounts of the same data:

- a member of the public wants to know where to go;
- a planner wants the week in one line, then the hospitals and the findings;
- an analyst wants all of that, plus the weekday pattern, the statistics and the checks.

Three pages would mean three copies of the same cards and the same figures, which drift apart.

## Decision

- **One page, three views:** Public (the default), Planner summary and Analyst detail.
- **The view is in the URL** (`?view=planner`, `?view=analyst`; Public is the plain address). A view
  can be shared, survives a reload, and works with back and forward. An unknown value is Public.
- **A config decides what each view shows** (`web/lib/homeViews.ts`). Each section lists the views it
  appears in and a density, simple or full. The page builds each section once and renders the list
  the config returns. The config also decides which API calls a view makes.

  | Section | Public | Planner | Analyst |
  |---|---|---|---|
  | Emergency line and "not medical advice" | full | simple | simple |
  | Clinic finder | yes | | |
  | Summary strip (four tiles) | | yes | yes |
  | Hospital cards | simple | full | full |
  | Map | yes | | |
  | Takeaways | | yes | yes |
  | Weekday pattern | | | yes |
  | Links to Data Quality and Methodology | | | yes |
  | Definitions and limits drawer | closed | closed | open, with the statistics |

- **A view changes what is shown, never a figure.** The badge, its thresholds and the usual level are
  the same code on every view. The full card adds the 12-week line and the change against usual as a
  percentage, which is the number the badge is already set from. The summary strip is four tiles built
  from the same statuses (hospitals above usual, longest bed wait, largest change, median across
  hospitals); the cards can be ordered by change, hours or name (`?sort=`). Planner and Analyst cards
  keep colour for the hospitals above usual only.
- **What must stay, stays on every view:** the 995 line, "not medical advice", the bed-wait
  definition, what MOH's figures cover (urgent care centre, adults only, the hospitals MOH leaves
  out), the NUHS estimate's label and time, and a date and source on every block.
- **The control is in the header, on the home page only.** It is a group of radio buttons from
  640 px and a select below that. The server reads the view through a header slot
  (`web/app/@viewbar`), so the control is in the first HTML and works as a plain form without
  JavaScript.

## Alternatives considered

- **Three routes (`/`, `/planner`, `/analyst`).** Simple links, but three page files to keep in step.
- **Remembering the view in the browser.** Not shareable, and the server would render one view and
  the browser switch to another.
- **Reading the URL in a client component in the header.** Next.js streams such a component in after
  the first HTML: without JavaScript it never appeared, and with it the header changed height.
- **Tabs built from links, as on the Access Map.** They work, but the brief asked for a radio group,
  and arrow keys on native radio buttons need no extra code.

## Consequences

- The public view is shorter and asks the API for less: no daily figures and no findings.
- The weekday pattern and takeaways moved off the default view. They are one click away, and the
  full findings remain on `/findings`.
- The Home link in the navigation always opens the Public view.
- The summary strip, the order of the cards and the shaded usual range are indicators computed by the site. They are defined in `data_dictionary.md`.
- A single "pressure index" across hospitals was considered and not built: it hides which hospital is unusual and needs a weighting the data can't justify.
- A new section needs one line in the config and one builder in the page.

## How it is enforced

- `web/lib/homeViews.test.ts`: the sections of each view, the fallback to Public, and the links.
- `web/lib/planner.test.ts`: sorting, the change as text (rounding, sign, zero, missing usual) and each tile's figure.
- `web/components/home/views.test.tsx`: both card densities keep the badge, the notes and the dates.
- `web/components/ViewSwitch.test.tsx`: the radio group, the select and the form.
- `web/e2e/views.spec.ts`: each view renders its sections and no others; the URL round trip; arrow
  keys; no JavaScript; axe (WCAG 2.2 AA) and no sideways scrolling at 375, 768 and 1280 px.
