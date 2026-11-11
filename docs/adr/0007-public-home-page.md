# 0007: A home page for the public, with the statistics one click away

**Status:** Accepted · **Date:** 2026-11-09

## Context

The home page was a scroll story of the insight engine's findings. Each step had a headline, a key
number, a chart, a detail sentence and a caveat. The statistical evidence (method, sample size,
adjusted p-value) sat beside each finding. It read well as an analysis, but it answered a planner's
question, not a resident's:

- A reader couldn't tell at a glance which emergency department (ED) was under pressure.
- Nothing pointed to a nearer alternative, which is what right-siting asks people to use.
- Every number was accompanied by text explaining how it was tested.

The data could already support a public view. MOH's daily bed waits give each hospital's latest
week against its usual level. The CHAS clinic list and HPB's polyclinic list have coordinates. The
NUHS estimates give a time to see a doctor for three sites.

## Decision

- **The home page leads with what a resident needs**, in this order:
  1. what the site is for, the 995 line, and a "not medical advice" line;
  2. a postcode or area search for the nearest polyclinics, CHAS GP clinics and EDs;
  3. one status card per ED, with last week's bed wait and a badge comparing it with that
     hospital's usual level;
  4. a map of the EDs (coloured by badge), polyclinics and the search;
  5. the weekday pattern, and up to three takeaways in the engine's shortest wording.
- **The statistics move into a closed "How these figures are made" drawer** at the bottom, and the
  full scroll story moves to `/findings`. Nothing was removed.
- **The badge is a plain comparison, not a finding.** Last complete week against the median of the
  8 complete weeks before it (the same "usual" as ED Trends and the unusual-week finding), at
  +15% (higher) and +30% (much higher). Fewer than 8 complete weeks gives "no comparison", never
  "about usual". It is documented in `data_dictionary.md`, "Computed by the site".
- **The search never leaves the site.** A postcode is placed using the site's own clinic,
  polyclinic and hospital lists (exact postcode, else the middle of its postal sector). It is a GET
  form, so it works without JavaScript. Analytics drop the query string.
- **The data doesn't change to fit the page.** The bed wait is labelled as a wait for a ward bed,
  never "waiting time". The NUHS estimate is labelled as the hospital's own estimate, with its time.

## Alternatives considered

- **An hourly (7 × 24) heatmap.** MOH publishes one median per day; hours would have been invented.
- **"Live" status for every ED.** Only NUHS publishes current estimates, captured weekly.
- **Geocoding with OneMap's search API.** More precise, but every search would go to a third party.
- **Chart libraries (Recharts) and an animation library (Framer Motion).** Server-rendered SVG and
  CSS transitions do the same within the 200 kB JavaScript budget.

## Consequences

- The site serves two readers: residents on the home page, planners and reviewers on `/findings`,
  ED Trends and the Access Map.
- Badge thresholds are chosen for readability and are not tested. The drawer says so.
- Hospital map pins and the polyclinic mart were added to the pipeline. Releases from before
  2026-11-09 have neither; the API serves them, and the page leaves those parts out.

## How it is enforced

- `web/lib/status.test.ts`: the thresholds, and "no comparison" when the usual level is missing.
- `web/lib/nearby.test.ts`: postcode, sector and area matching; nothing is guessed.
- `web/lib/analytics.test.ts`: a search never reaches analytics.
- `web/e2e/home.spec.ts`: the cards, the search with and without JavaScript, the closed drawer, the
  "not medical advice" line, and axe and 375 px checks.
