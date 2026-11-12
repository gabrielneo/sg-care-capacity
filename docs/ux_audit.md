# UX audit: home views, public view, finder, map and drawer, site strip

Audit date: 2026-11-12. Independent review; nothing was fixed. Findings are ranked by severity, then a fix checklist for approval.

## Scope and method

- **What was audited.** "Prompts 1–6" were not available to the reviewer, so scope is inferred from the repository: commit `cd9b6d2` (home views) plus the uncommitted working tree (public view, finder, hospital map and drawer, site strip, chart callouts, `usual_gap` insight). Confirm this matches your six prompts.
- **Baseline ("main").** Commit `c783346`, the last commit before the home views, built and served the same way as the current tree. All three servers used the API's fixture snapshot.
- **Fixture limit.** The fixture has 3 hospitals in 2 clusters. Nothing here exercises the real 9 hospitals, long lists or long names at 375px. Re-run the screenshots against the real snapshot after fixes.
- **Not covered in depth.** The `usual_gap` detector and chart callouts were reviewed through code and tests only, not on screen.
- **Probe.** 14 routes × 375/768/1280px (42 loads): axe (WCAG 2.2 AA tags), horizontal overflow, targets under 44px, 995 notice, banned phrases. Plus a scripted keyboard walk. Probe scripts are not committed.

### Test and tooling results

| Check | Result |
|---|---|
| Vitest | 558 passed (56 files) |
| `npm run lint` (eslint, terminology, readability) | pass (5 sentence-length warnings, all in methodology.md) |
| `npm run typecheck` | pass |
| Playwright e2e + axe (desktop + 375) | 395 passed, 13 skipped (skips are viewport-specific by design) |
| pytest pipeline / api | 316 passed / 126 passed |
| Probe: horizontal overflow | none, on any route or width |
| Probe: axe | 0 violations, except `target-size` (1 node) at 375px on `/data-quality` |

## What passes

- **Status is never colour alone.** The badge, map markers, freshness pills, chips and toggles each carry a symbol and text, plus `aria-pressed` for the chips and toggles. Sparklines are decorative and have a text summary.
- **One status function.** `levelFor`/`hospitalStatus` in `lib/status.ts` is reused by cards, tiles, map, drawer and strip. Thresholds are 15% and 30%, "usual" is the 8-week median.
- **Text contrast.** Status text on its tint is 6.8–7.6:1; muted text 7.2:1; white on the red emergency band 8.3:1.
- **Keyboard.** Every tab stop showed a 3px solid outline. The drawer opens with focus on Close, Tab and Shift+Tab stay inside it, Esc closes it and focus returns to the opening button. Cluster chips (strip and panel) and the Map/List toggle work from the keyboard and stay in sync through `?cluster=` and `?layout=`.
- **Reduced motion.** The drawer animation is `none` under `prefers-reduced-motion: reduce` and `care-drawer-in` otherwise.
- **Wording.** No "fastest", no causal words in UI strings, no unqualified "wait time". The only "wait time" hit is a NUHS dataset title on `/data-quality`, which is a source name. The finder says "Nearest", and `lib/callouts.ts` has a causal-word guard.
- **Coverage caveats** (AH is an urgent care centre, NUH adults only, KKH and NUH children's excluded) appear on the cards and in the drawer, from `dim_hospital`.
- **Privacy.** `/places.json` carries no query. Analytics drop the query string and fragment.
- **Cluster** comes from `dim_hospital.cluster` through the API, not from the UI.

## Findings

### High

**H1. The "not medical advice, call 995" notice is on 3 of 14 routes, not every view.**
It is on the three home views and `/case-study` (which only mentions 995 in prose). It is missing on `/ed-trends`, `/live`, `/access-map`, `/findings`, `/summary`, `/data-quality`, `/methodology` and `/glossary`. `lib/homeViews.ts` says "on every view", which holds only for the three home views. The layout footer has no such line. `/ed-trends` and `/live` show hospital figures, so this is where it matters.

**H2. The site strip's count has no visible source or date on phones, and only an age on desktop.**
"1 of 3 hospitals busier than usual · week of 19–25 Oct" is on every page. The as-of date and source sit in the pills:
- Below 1280px the pills are hidden behind a "Details" button, so the count shows with no source.
- At 1280px the pill shows "12 days old", not the date. The date is only in a `title` tooltip, which touch and keyboard users cannot reach.
- The NUHS caveat "estimates, for some hospitals only" is also only in that `title`.

This breaks the "every number shows as-of and source" rule on the most common viewport.

### Medium

**M1. "Busy/busier" is unsupported vocabulary, and it forks the status scale's words.**
The metric is bed wait, not crowding or attendance. The site says "busier than usual" in the strip, the public badge ("Busier than usual for this hospital") and the heading "How busy were EDs near you last week?". The word is defined only in ADR 0011, not in `docs/language_rules.md`. The brief's scale is "Higher / Much higher than usual". The public view keeps the same levels but adds a second set of words (`LevelInfo.plain`). That is arguably the second scale the brief forbids. **Decision needed:** keep `plain` but base it on "bed waits were longer than usual", or revert to the scale's own labels.

**M2. Outline controls fail non-text contrast (WCAG 1.4.11).**
Chips, the Map/List toggle's unselected side and card borders use `--color-line` #CBD5E1, which is 1.48:1 on white. The boundary is the only cue that these are controls. axe does not test this rule.

**M3. Tap targets under 44px on primary controls.**
Counts per page at 375px: 9 (glossary) to 245 (methodology), mostly inline links, which are exempt. The non-inline cases that matter:
- Strip "Details" button 71×28.
- Strip cluster chips 28px high (`h-7`).
- Strip lead link 30px.
- Header home link 24px.
- Sort links 36px.
- "See which hospital" 20px.
- Checkboxes on ED Trends 16px.
- axe `target-size` fails at 375px on `/data-quality`.

The panel's own chips and toggle are correct at 44px.

**M4. Two cluster filters for one state.**
The strip chips (28px, desktop and phone behind Details) and the panel chips (44px) both write `?cluster=`. The strip's four stops come before the main content, though the skip link bypasses them. Pick one.

**M5. "What you type… isn't sent to any server" overstates privacy.**
After a search the map fits the searched point at up to zoom 15 (`CareMapLeaflet.tsx:81`), so the browser requests OneMap tiles for roughly that 1 km area. The typed text stays local, but the area is visible to a third party. I confirmed this from the code, not from network logs. Either reword the note or cap the zoom.

**M6. Ranking tile lacks coverage caveats.**
"Longest bed wait last week: SGH" ranks hospitals and notes only the urgent care centre. NUH adults-only is not on the tile. A code comment says "Busiest first, so the hospitals to avoid lead" (`lib/status.ts:82`). That is advice-shaped wording even though the UI text avoids it.

**M7. No dark mode exists.** The brief asked for AA in light and dark. The CSS defines only light tokens, so dark could not be audited. **Decision needed:** out of scope, or add it.

### Low

- **L1.** The pipeline has no data check on `dim_hospital.cluster` (the brief asks for one when the column is added). A null would give a blank chip.
- **L2.** "8 complete weeks" is hard-coded in the drawer and Methods text; `USUAL_WEEKS` exists.
- **L3.** Hospital pin source and date are not shown beside distances (ED nearby, map). The weekly bed-wait and clinic provenance are shown; the hospital location source is not.
- **L4.** The drawer's missing-value dash "–" and the cards' "–" have no accessible text such as "no complete week".
- **L5.** The freshness pill "Out of date" uses the same red and ✕ as the "Much higher" status. Two meanings share one visual. The pill name "Doctor-wait estimates" is shorthand; consider "Time-to-see-doctor estimates (NUHS)".
- **L6.** Summary tiles say "bed wait", not the full label. The explainer sits in the same section, so this is acceptable.
- **L7.** Lighthouse CI measures only the public `/`. Planner and Analyst are not budgeted.

## Number traceability

I read each number's source in code and on screen. I did not diff every API payload.

| On-screen number | API field / table | As-of + source shown? |
|---|---|---|
| Strip "N of M busier", week | weekly bed wait (`mean_of_daily_median_wait_hours`, `is_complete_week`), dim_hospital | **No on phones; age only on desktop (H2)** |
| Strip pills | `meta.sources[].as_of` | Age visible, date in tooltip only (H2) |
| Summary tiles (4) | weekly bed wait | Yes, each tile |
| Hospital cards, hours, usual, % | weekly bed wait | Yes (Provenance) |
| To-see-a-doctor estimate | live NUHS `est_wait_to_see_doctor_*`, `snapshot_at` | Own timestamp, labelled estimate; no separate source line in the drawer |
| Distances (km) | dim_hospital lat/long, clinics, polyclinics | Clinics and polyclinics yes; hospital pins no (L3) |
| Map count "Showing x of y" | dim_hospital | Provenance for bed waits below the map |
| Thresholds 15%/30%/8 weeks | constants | 8 hard-coded in two places (L2) |

Freshness ages are computed on the server from the API's `as_of`. The strip response is cached for up to 5 minutes (plus up to an hour stale-while-revalidate), which is acceptable.

## Keyboard walkthrough

Public view tab order after the skip link: logo, view switch, 8 nav links, strip lead link, 3 strip chips, **Call 995**, glossary terms, postcode box, Find clinics, kind radios, nearby-ED terms, Analyst link, panel chips. Planner: strip, "bed wait" term, "See which hospital" (opens on focus, closes on Esc), source links, sort links. The map markers are buttons labelled with name and status. The Leaflet basemap has its own keyboard hint. Issues are limited to M3 and M4.

## Viewports (screenshots in `docs/images/ux_audit/`)

No page overflow at 375, 768 or 1280px on any of the 14 routes. No clipped text found by the scripted check. Screenshots: `home_375/768/1280`, `planner_375/768/1280`, `near_375/1280`, `hospital_375/1280` (drawer), `ed_trends_375`, `strip_open_375`.

At 375px the emergency band fills most of the first screen on the public view, which is intentional. The drawer is a bottom sheet at 85% height with a 44px Close button.

## Performance: current tree vs baseline (3 Lighthouse runs, median, mobile emulation, `/`)

| Metric | Baseline `c783346` | Current | Budget |
|---|---|---|---|
| Performance | 98 | 98 | – |
| Accessibility / Best practices / SEO | 100 / 96 / 100 | 100 / 96 / 100 | – |
| LCP | 2.33 s | 2.33 s | ≤ 2.5 s |
| CLS | 0 | 0 | ≤ 0.01 |
| TBT | 22 ms | 24 ms | – |
| JS transferred (Lighthouse) | 154.3 kB | 165.8 kB (+11.5 kB, +7.5%) | ≤ 200 kB |
| JS, other measure (all pages loaded) | `/` 151.6 kB, `/ed-trends` 147.6 kB, `/methodology` 149.3 kB | 162.9 kB, 149.9 kB, 151.6 kB | – |

- New client components add about 11 kB gzip on `/`. The site strip, which loads on every page, adds about 2.3 kB there.
- LCP has about 0.17 s of headroom and JS about 34 kB, so the next client feature may break a budget.
- The baseline `/` was a different page (nine hospital cards), so this is a like-for-like route, not like-for-like content.

## Proposed fixes (tick to approve)

**Do first**
- [ ] **H1** Put the "not medical advice; in an emergency call 995" line in the layout footer or a slim band on every page. Add an e2e test that visits every route.
- [ ] **H2** Make the strip carry its own source and date visibly: "MOH, week of 19–25 Oct, data as of 31 Oct" in text on every width. Replace the `title`-only caveats with visible text or a focusable popover.

**Then**
- [ ] **M1** Decide the "busier" wording (options above), then update status labels, strip, heading, ADR 0011, `language_rules.md` and the tests together.
- [ ] **M2** Darken control borders to at least 3:1 (about #94A3B8) for chips, toggle and inputs. Add a contrast unit test on the tokens.
- [ ] **M3** Raise strip controls to 44px tap area (padding, not visible size if preferred); move sort links to 44px; leave inline links as they are. Add a Playwright check of target size on primary controls.
- [ ] **M4** Remove the strip cluster chips and keep the panel chips (or the reverse).
- [ ] **M5** Reword the privacy note to say tiles for the map area are fetched from OneMap, or cap the zoom at 13 after a search.
- [ ] **M6** Add the NUH adults-only caveat to the longest-bed-wait tile; reword the `byPressure` comment.
- [ ] **M7** Decide: dark mode out of scope (record in docs) or add tokens plus axe runs in dark.

**Tidy**
- [ ] **L1** Add a pipeline check that `dim_hospital.cluster` is non-null and in the known set.
- [ ] **L2** Use `USUAL_WEEKS` in the drawer and Methods text.
- [ ] **L3** Show hospital location source in the ED nearby and map provenance.
- [ ] **L4** Add "no complete week" text for missing values.
- [ ] **L5** Give freshness pills a distinct style from status; rename the doctor estimates pill.
- [ ] **L7** Add `?view=planner` to Lighthouse CI.
- [ ] Re-run this audit's probe against the real 9-hospital snapshot after the above.
