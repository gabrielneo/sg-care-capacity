# Redesign brief: "Paper & Ink"

The "calm & clear" redesign of the web app. This page is the reference for every redesign change:
what it aims for, which pages it covers, and how the result is measured against the starting point.

## Design principles

In priority order. When two conflict, the higher one wins.

1. **Trust first.** Every number is correct and consistently defined, and shows its as-of date and
   source once per section, not on every tile.
2. **One idea per section.** Each section answers one question, stated in its heading.
3. **Calm surfaces.** Warm paper background, ink text, one accent colour (ink blue). Strong colour is
   reserved for status (much higher, higher, lower) and for data. No green as a brand or interface
   colour. No gradients, glassmorphism, glow or decorative illustration.
4. **Reading rhythm.** Generous, consistent spacing. Prose at most 68 characters wide. Alternating
   section bands, so long pages read as chapters.
5. **Progressive disclosure.** Summary first, detail behind expanders, drawers and links. Information
   an analyst needs is moved, never deleted.
6. **Consistency.** The same component, the same anatomy and the same naming everywhere.

## Theme: Paper & Ink

| Role | Intent |
|---|---|
| Page | Warm paper background |
| Text | Ink |
| Accent | Ink blue: links, focus, selected controls. The only interface accent. |
| Status | Much higher, higher, lower: always symbol + word + colour, never colour alone |
| Data | Chart and map palettes, kept separate from the interface colours |

Every colour, font size, spacing step, radius and shadow comes from a design token (CSS variable and
Tailwind theme). Components use no raw hex values and no arbitrary Tailwind values such as
`text-[13px]`; a lint rule or test enforces this.

## Data rules that don't change

- **Bed wait** is the time from the decision to admit until leaving the ED: MOH's daily median,
  averaged per week. It is never called "wait time" on its own, and it is not the time to see a doctor.
- **Usual** is the median of the previous 8 complete weeks. Status: 15% or more above is higher;
  30% or more above is much higher; 15% or more below is lower; otherwise about usual. The one status
  function is `levelFor` in `web/lib/status.ts`.
- **Alexandra Hospital (AH)** is an urgent care centre. It is shown in its own group and left out of
  every rank, count, median and "largest change".
- **NUH** covers adults only. KKH and NUH children's emergency are not in MOH's figures. Doctor-wait
  figures are NUHS estimates with their own timestamp.
- The **995 / not medical advice** notice stays reachable on every page.
- No invented, mocked or hard-coded data in production code.

## Quality bars

- Server components by default.
- WCAG 2.2 AA: text at least 4.5:1; large text and control boundaries at least 3:1. Visible focus
  ring. `prefers-reduced-motion` respected.
- No horizontal page scroll at 375, 768, 1280 or 1440px.
- Vitest, Playwright with axe, and Lighthouse CI stay green. New behaviour gets a test.

## Routes in scope

| Route | Page |
|---|---|
| `/` | Landing page |
| `/find` | Clinic finder (public view by default) |
| `/find?view=public` | Finder, public view |
| `/find?view=planner` | Finder, planner view |
| `/find?view=analyst` | Finder, analyst view |
| `/project` | The project |
| `/findings` | Findings |
| `/explore` | Explore hub |
| `/ed-trends` | ED Trends, all hospitals |
| `/ed-trends?hospital=<code>` | ED Trends, one per hospital the API lists |
| `/access-map` | Access Map |
| `/live` | NUHS estimates |
| `/data-quality` | Data quality |
| `/methodology` | Methodology |
| `/glossary` | Glossary |
| `/how-its-built` | How it's built |
| `/case-study` | Case study |
| `/docs/insights-method` | Insights method |

## Measuring stick

Both tools run on the API's fixture snapshot (3 hospitals, 2 planning areas) and the production
build, so before and after are compared on the same data. They are not part of `npm run e2e` or CI.

| Tool | Command | Output |
|---|---|---|
| Visual baseline: full-page screenshots of every route above at 375×812, 768×1024 and 1280×800 | `cd web && npm run visual:baseline` | `web/tests/visual/__baseline__/` |
| UI metrics per route and width | `cd web && npm run ui:metrics` (set `UI_METRICS_OUT=after` for the final run) | `docs/design/ui_metrics_before.json` |

The screenshots disable animations, wait for network idle and loaded fonts, block map tiles, and
mask text that changes with the date: every `<time>`, freshness ages and labels, NUHS update times
and the footer's release-check line.

The metrics, defined in `web/scripts/ui-metrics.ts`:

- distinct font sizes
- text elements under 14px
- distinct text and background colours
- page height
- visible "Data as of" lines
- horizontal overflow, of the page and of any element not inside a scroller

## Open decisions

These conflict with the current docs, or the brief leaves them open. Each is settled before the
change that depends on it.

1. **AH in counts and "largest change".** `docs/data_dictionary.md` ("Computed by the site") counts
   hospitals "out of all hospitals the API lists" and keeps AH in the change tile, and today only
   `longestWait` leaves AH out. The brief leaves AH out of all of them; the data dictionary changes
   with the code.
2. **As-of once per section.** Settled 2026-11-14: `CLAUDE.md` (data principle 4) and
   `docs/data_dictionary.md` ("Show `as_of`...") now say once per section, with every figure covered by
   that line. The per-tile lines on the pages are removed in a later change.
3. **Status words.** The public view's "busier than usual" words (`LEVELS[].plain`, ADR 0011,
   data dictionary "Plain status words") are a second set of names for the same scale. Principle 6
   points to one set: Much higher, Higher, About usual, Lower.
4. **The colour for "lower".** Settled 2026-11-14: muted violet (`--status-lower`, #5B4A8B light, #B3A3E6
   dark), matching the heatmap's "shorter". "About usual" is neutral slate (`--status-usual`). The tokens
   are in `web/styles/tokens.css`; `web/lib/tokens.contrast.test.ts` checks every pair in both themes.
   Orange and brown mean longer waits, violet shorter; ink blue is interface only. The access maps keep
   their Viridis data scale (it passes through green): it is data, never interface.

## Fonts and type scale (2026-11-15)

- **Scale.** `web/styles/tokens.css`: `--fs-meta` 13, `--fs-small` 14, `--fs-body` 16 (17 from 1280px), `--fs-h3` 18,
  `--fs-h2` 22 (24 from 640px), `--fs-h1` 28 (36 from 640px), `--fs-kpi` the same as h1. Tailwind's own sizes are removed, so
  `text-meta` ... `text-kpi` are the only text sizes, and `web/test/design-tokens.test.ts` fails on any other.
- **KPI size.** The brief's 34px KPI next to a 36px h1 would make seven sizes on a page that has both. The budget is six
  (`web/e2e/type-scale.spec.ts`, 13px floor), so the KPI figure uses the h1 size.
- **Fonts: web fonts not adopted.** Self-hosted Inter (one variable file) took the Overview's LCP to 2.63 s, and Inter plus Source Serif 4
  to 2.77 s, against a 2.5 s budget that the system fonts meet. The stacks still name Inter and Source Serif 4 first, so a reader who has
  them installed sees them. Everyone else gets system-ui and Iowan Old Style / Georgia. Revisit if the budget is relaxed or the pages get lighter.
5. **Section header and tile names.** Settled 2026-11-15: every home-page data section states its window, source and date once, in
   `SectionHeader`, as "Data as of {date}" (the wording of `docs/language_rules.md` Rule 6; the UI-metrics count and the section test
   also accept "Data to"). The summary tiles are named "Emergency departments above usual", "Longest bed wait", "Biggest change vs the 8-week usual"
   (renamed 2026-11-16 from "Biggest change vs usual (previous 8 complete weeks)", which took three lines at four columns; still up or
   down: the data dictionary's definition is unchanged) and "Typical bed wait across emergency departments". "Busier" is
   not used (decision 3). The urgent care centre stays out of all four, with the one line under the tiles saying so.


## Charts (2026-11-15)

- **Diverging ramp (heatmap).** `--div-1…7` is now `#4B3A7A #6E5CA3 #C9C0E3 #EFEAE1 #F2D3A8 #E0A35A #A85A14`: violet (shorter) through a warm neutral to orange (longer).
  Two of the brief's seven colours, `#7E6CB0` and `#B5651D`, reach only 4.4:1 and 4.2:1 with either label colour, so they became `#6E5CA3` and `#A85A14`.
  Each cell takes whichever of the two label colours has more contrast (`textOn`); `lib/chartColors.test.ts` checks every bin reaches 4.5:1.
  The data scales are the same in both themes, as before. Every cell carries a 1px `--border-subtle` edge, because the neutral bin is 1.07:1 against the page.
- **Categories (compare mode, at most four).** `--cat-1…4`: ink blue `#2E4A7D`, rust `#9C4F3D`, slate `#5F636D`, ochre `#8A6A12`; lighter in the dark theme.
  Ink blue is the one case where the interface accent is also data (decision 4's rule stays: it never means a status).
  The brief's olive `#6B6F2A` failed the colour-blind check (ΔE 7 from rust under deuteranopia, 10 from slate under tritanopia), so it became ochre.
  `lib/chartColors.test.ts` simulates protanopia, deuteranopia and tritanopia and requires ΔE ≥ 15 for every pair, and no category is a status colour.
- **Chart frame.** `ChartFrame` is the one frame for every chart; `ChartCard` is retired (2026-11-15) and `test/no-chartcard.test.ts` plus an ESLint
  `no-restricted-imports` rule fail if it comes back. Every frame has a required `summary` (read by screen readers, not shown), a required `csv`, and a
  required `table` choice: the figures behind "Show as table", `"self"` when the chart already is a table, or `{ href }` when the table is another view (the maps).
  - **Provenance.** A frame shows its own "Data as of … · Source: …" line. Under a `SectionHeader`, `section={meta}` makes it inherit that section's line when the
    date and sources are the same (`lib/sectionMeta.ts`); if they differ it shows its own. `data-provenance="own|section"` says which. A frame whose meta has no
    usable date or source is not drawn, and warns in development. `e2e/helpers.ts` `expectProvenanceOnEveryFrame` fails a page where a chart has neither.
  - **States.** `state="empty"` ("No data for this period"), `state="error"` (a calm message and a "Try again" link, `retryHref`), and the freshness pill. The loading skeleton
    (`ChartFrameSkeleton`) is hidden for the first second by a CSS delay (`delay-show`), so a fast load never flashes it.
  - **CSV.** Each chart's CSV starts with `#` lines for its title, `data_as_of`, `source`, `window` and `definition`s, then the table (`?context=1`; `lib/exportRoutes.ts`
    `csvBody`). New files: `live.csv`, `quality.csv`, `freshness.csv`, `ed-coverage.csv`, `nuhs-vs-moh.csv`.
    The same table is an Excel workbook with `&format=xlsx` ("About" and "Data" sheets; `lib/xlsx.ts` writes it, no dependency, no formulas). "Copy with caption" is a small client
    component (`CopyCaption`) that copies the title, summary, date, source and a link as text.
  - **Dropped on purpose.** `provenance={false}`: a chart could be left with no date at all. `/live` is now one frame, "NUHS estimates by site", with the readings inside it as plain
    articles (one date and source, one table, one CSV) instead of four charts. The `chart-card` test id is now `chart-frame`.
- **Main series** are `--text-primary` at 2px; the all-hospital band is `--bg-sunken` with a `--border-subtle` edge; missing days are hatched, never filled.
- **Event annotations.** The chart supports them (`lib/annotations.ts`, vertical rules and a key) but draws none yet: there is no events table. See the open question on public holidays.
