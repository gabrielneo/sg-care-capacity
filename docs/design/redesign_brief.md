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
| `/` | Home (public view by default) |
| `/?view=public` | Home, public view |
| `/?view=planner` | Home, planner view |
| `/?view=analyst` | Home, analyst view |
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
2. **As-of once per section.** `CLAUDE.md` (data principle 4) and `docs/data_dictionary.md` ("Show
   `as_of` next to every number") ask for it on every number. Principle 1 asks for it once per
   section; both docs need rewording to match.
3. **Status words.** The public view's "busier than usual" words (`LEVELS[].plain`, ADR 0011,
   data dictionary "Plain status words") are a second set of names for the same scale. Principle 6
   points to one set: Much higher, Higher, About usual, Lower.
4. **The colour for "lower".** Today "about usual" and "lower" share green (`--color-ok`). Under
   principle 3, "about usual" becomes neutral, and "lower" needs a status colour that is neither
   green nor confusable with the ink-blue accent.
5. **Dark mode.** Not in the brief; the old audit (`docs/ux_audit.md`, M7) asked for a decision.
