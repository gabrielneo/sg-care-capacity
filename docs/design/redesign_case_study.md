# Case study: a calm, clear redesign

Draft written from the repo's own records (`redesign_brief.md`, the UX audit, `review_2026-11-16.md`). The reflections come from the same records; the 5-second test has not been run.

## Problem
The 14 Nov 2026 UX audit found a site that was not over-full but noisy and inconsistent. The same "Data as of ... Source ..." line repeated on every tile; two type systems competed (8 sizes, 116 text elements under 14px on the Analyst view); card contents did not line up; Alexandra Hospital, an urgent care centre, was ranked in some numbers and not others; and a CV link sat inside the product. At 375px the Analyst view was 6,316px tall.

## Principles
In priority order (full text: `redesign_brief.md`): trust first; one idea per section; calm surfaces; reading rhythm; progressive disclosure; consistency. When two conflict, the higher one wins.

## Palette rationale
- **Warm paper and ink.** A warm off-white page with dark ink text reads like printed reference material, which suits a site that tells people to check numbers. It is quieter than a white dashboard with coloured tiles.
- **One accent: ink blue.** Used only for links, focus and selected controls, so blue always means "you can act here".
- **Status colours are reserved for status.** Orange and brown mean longer than usual; muted violet means shorter. They are never used as brand colour, so a coloured thing is always data. Every status also carries a symbol and a word.
- **Why orange and violet, not red and green.** Longer is not "bad" for every reader, and red/green fails for common colour blindness. The brief settled on orange/violet on 14 Nov and `lib/chartColors.test.ts` checks the pairs under simulated colour-blindness. Two brief colours were darkened because they reached only 4.4:1 and 4.2:1 contrast.
- **No green as an interface colour**; the access maps keep their Viridis data scale, which passes through green, as data only.
- Contrast is tested for every pair in both themes (`lib/tokens.contrast.test.ts`).

## Key decisions
1. One provenance line per section (`SectionHeader`); children show a tag only when they differ. Written into `CLAUDE.md` data principle 4.
2. Alexandra Hospital in its own "Urgent care centre" group, outside every rank, count and median (ADR 0012).
3. A six-size type scale with a 13px floor; KPI figures share the H1 size to stay within six.
4. Spacing, radius and colour from tokens, with tests that fail on raw hex or arbitrary Tailwind values.
5. Fixed card anatomy on a subgrid, so figures line up across a row.
6. One `ChartFrame` for every chart, each with a hidden screen-reader summary, a table view, CSV and Excel export with its as-of and source, and "Copy with caption".
7. Mobile: a 56px header, a menu sheet and accordions for the weekday heatmap and the methods.
8. No web fonts. Self-hosted Inter pushed LCP to 2.63 s against a 2.5 s budget, so system stacks are used.

## Metrics, before and after
Fixture data, production build. Full table and caveats: `review_2026-11-16.md`.

| | Before | After |
|---|---|---|
| Font sizes, worst route | 9 | 6 |
| Text under 14px, Analyst 375 | 116 | 0 |
| "Data as of" lines, Analyst | 8 | 4-5 |
| Analyst height at 375px | 6,316px | 4,730px |
| Public height at 375px | 2,679px | 3,625px (3,801 before the 16 Nov fixes) |
| Findings: "Data as of" lines | 6 | 3 date lines (9 until the 16 Nov fix; the metric reads 4, as it also counts "uses data to") |
| Lighthouse performance / LCP | not recorded / 2.33 s | 98 / 2.32 s (ED trends 2.47 s) |
| Tests | n/a | 1,072 unit, 703 end-to-end passing |

The redesign cut type noise and repeated metadata sharply on the Analyst and Planner views. It did not shorten every page: Public, Findings and ED trends are longer on mobile, mostly because of the stacked footer, the export controls under each chart, and the public hospital table (`review_2026-11-16.md`, N2). Findings first repeated provenance more than before (9 lines); one shared line per section brought it to 3.

## Before / after
Pairs are in `before-after/`; both sides use fixture data (3 hospitals), so they compare like with like. The same views on the real 9 Nov release (9 hospitals) are the `real-*.png` files, the ones to show a reader: `real-analyst-top-1280.png`, `real-hospital-grid-1280.png`, `real-heatmap-1280.png`, `real-findings-1280.png`, `real-home-375.png`, `real-explore-1280.png`.

| View | Before | After |
|---|---|---|
| Analyst, top at 1280 | `before-analyst-top-1280.png` | `after-analyst-top-1280.png` |
| Hospital grid | `before-hospital-grid-fixture-1280.png` | `after-hospital-grid-fixture-1280.png`; 9-card layout in `after-hospital-grid-sample9-1280.png` (sample data) |
| Heatmap | `before-heatmap-1280.png` | `after-heatmap-1280.png` |
| Findings | `before-findings-1280.png` | `after-findings-1280.png` |
| Mobile home | `before-home-375.png` | `after-home-375.png` |

## What I'd do next
See section 6 of `review_2026-11-16.md`. In short: state provenance once on Findings, find what made Public and Findings longer on mobile, unify the name of the bed-wait measure, run the 5-second test, and re-capture on real data.

## Reflections
- What surprised me: how little of the loading time was the page. React and the Next.js router are 72% of the 153 kB of script, so the landing page measures the same 2.33 s as `/methodology`; and that the Linux fonts on CI are wider than my Mac's, so a header that fit on my machine overflowed to 801 px there.
- What I would change about the process: test on real data from the start. The fixture has 3 hospitals, so card names cut off, long lists and the 9-card grid only showed up on the real release (N9 to N12 in the review), after the first round was already "done".
- The 5-second test has not been run yet, so there is nothing to report from it.
