# Care-pacity: pre-publish remediation prompts

Run these in order in Claude Code (or another coding agent) from the repo root of `sg-care-capacity`.

**How to use**
- Paste **Prompt 0** at the start of every session.
- Run **Prompt 1** first. It is read-only, and its results decide which later prompts you need. If it shows a criticism was wrong (for example, polyclinics are already counted), skip the matching step.
- Prompts 3, 6 and 10 contain decision points where the agent should stop and ask you. That is intentional.
- Prompt 14 is the final go / no-go check.

| # | Prompt | Addresses |
|---|--------|-----------|
| 0 | Shared rules | Guardrails for every session |
| 1 | Verify every claim | Stale data, README mismatches, hospital counts, clinic categories |
| 2 | Reframe the claims | "Seniors" and "emergency waits" overstatements |
| 3 | Rework "usual vs latest week" | "0 of 8" non-finding, confusing table column |
| 4 | Weekly metric, tail, hero trend | Mean of medians, like-for-like trend, uncertainty |
| 5 | Choose the top finding better | Weak day-of-week headline, adult-only NUH |
| 6 | Fix the clinic metric | CDMP-only, 2-year date gap, small denominators, benchmark, colours |
| 7 | Freshness and the weekly claim | Missed releases, "Due an update" |
| 8 | Copy and trust consistency | "Live waits", "independent" audit |
| 9 | Sync README and docs | 12.7h screenshot, 7 vs 8 EDs, stale numbers |
| 10 | Audience, navigation, footer | Portfolio vs public tool, internal pages in footer |
| 11 | Plain-English pass | Jargon, repeated glossary, name and title |
| 12 | Performance and resilience | Cold starts, 3D bundle, graceful failure |
| 13 | Honest engineering narrative | CLAUDE.md, limitations, reviewer questions |
| 14 | Final pre-publish QA | Go / no-go |

---

## Prompt 0: Shared rules (paste at the start of every session)

```
You are working on sg-care-capacity (pipeline/, api/, web/, docs/). Rules for this session:
1. Never fabricate, estimate or fill in data. Missing stays missing.
2. Investigate first. Before editing, report what you found (file paths, current behaviour, evidence). If the problem I describe does not exist, say so and stop.
3. Keep all existing tests passing (make test). Add or update tests for every behaviour change.
4. Any number shown on the site must keep its "Data as of" date and source.
5. Do not use causal language in findings.
6. At the end, give a short summary: what changed, what you could not verify, and anything needing my decision.
```

---

## Prompt 1: Verify every factual claim (read-only; run this first)

```
Read-only audit; change no files. Check each claim below and report evidence for each:
a) The README says the pipeline runs weekly on Sunday. The live site showed "Data as of 14 Nov 2026" and latest complete week 2-8 Nov while today is 25 Nov, with a "Due an update" badge. Inspect .github workflows, recent Actions runs, and GitHub Releases. Were releases missed? Is MOH's source lagging? Which?
b) README says 7 EDs + Alexandra UCC reported throughout; the site lists 8 EDs + Alexandra. Which hospitals are in each chart, and when did each first report (check Woodlands Hospital especially)?
c) README screenshot shows a "12.7 hours" top finding; the site shows an NUH Tue-Wed finding. List every README/docs number that differs from live output.
d) The clinic metric: which clinic categories are counted (CDMP GP only? polyclinics? Healthier SG clinics?). What is the clinic list's date vs the population date?
e) For each ranked planning area, list the 65+ population. Which have fewer than ~2,500 seniors? Do the highest rates come from small denominators?
f) The Explore page copy says "check live waits" while the footer says it doesn't show current availability. Which is true? What does the NUHS source provide?
g) What exactly is "benchmark rate" in the Hougang "9 fewer clinics" claim?
Output a table: claim, verdict (confirmed / not confirmed / unclear), evidence, file path.
```

---

## Prompt 2: Reframe the claims to match the data

```
Task: make the site's framing honest about what the data shows.
- ED data has no age breakdown, so it cannot say anything about seniors. Rewrite the hero title, meta/OG descriptions, page <title> and README intro so that the ED section is about bed waits for admitted patients at public hospitals, and the clinic section is about seniors. State plainly, near the top, that the two datasets are shown side by side and that the project does not test a link between them.
- Replace "emergency waits" wherever it means "wait for a ward bed after the decision to admit" with accurate wording, and add one visible sentence on what is NOT measured (time to triage/see a doctor, patients not admitted).
- Update the OG image text if it carries the old claim.
Show me the before/after copy for each location, then apply it. Keep the tone plain-English, no jargon.
```

---

## Prompt 3: Rework the "usual vs latest week" test

```
Context: the homepage says "0 of 8 emergency departments above usual" even though CGH is +51% and SKH is -35%. The rule is >=15% AND outside all 8 prior weeks. The table also shows "Weeks in the usual level: 8 of 8" for every hospital, which reads as a contradiction.
1. Using the history in the data, simulate the current rule over all past weeks. Report how often each hospital is flagged, and the week-to-week variation (coefficient of variation) per hospital.
2. Propose a better rule (for example a robust z-score or percentile of the hospital's own trailing 26 weeks, or a rolling-baseline interval), with the trade-offs. Wait for my approval before implementing; give me 2-3 options with the simulated flag rates.
3. After approval: implement it in the pipeline/insight engine, update tests, and fix the table so the last column says something unambiguous (e.g. "Latest week vs its own range: within / above / below").
4. Make the chart and caption say how noisy each hospital is, so "about usual" is not read as "stable".
```

---

## Prompt 4: Weekly metric, the tail, and the hero trend

```
1. MOH publishes only daily medians, so a week's figure is an average of daily medians. Add a plain-English note directly under the chart (not hidden in "More about these figures") saying this understates busy days and says nothing about the longest waits.
2. If daily volume (ED visits that day) is available, compute a volume-weighted version, compare it to the unweighted one, and tell me how much they differ. Show whichever is more defensible, and say which.
3. Hero trend (Dec 2023 8.2h -> Oct 2026 5.4h): check whether the hospital set changed over the period (see the Prompt 1 findings on Woodlands). Rebuild the series on a like-for-like set of hospitals only, and label the chart with the hospitals included. Check whether the Dec 2023 start is a seasonal or one-off peak; show the full available history, or at least year-on-year, so the start point is not flattering.
4. Add an uncertainty indication, or at minimum a "within normal variation" note, to the "-6% vs October 2025" figure.
Update tests and docs/methodology.md.
```

---

## Prompt 5: How the "top finding" is chosen

```
The homepage "Top finding" is an NUH Tue-Wed day-of-week effect. NUH is adult-only, and the finding was picked because it passed a significance test, not because it matters to a reader.
1. Review the insight engine's ranking. Add an effect-size and practical-relevance filter (e.g. minimum absolute hours difference, minimum number of weeks supporting it, and hospitals with caveats ranked lower or labelled).
2. Rank findings by usefulness to a general reader: a persistent hospital-level difference or a long-run trend ranks above a weekday pattern at one site.
3. If no finding clears the bar, the homepage should say so honestly ("no unusual pattern this week") instead of promoting a weak one.
4. Always show the adult-only caveat next to any NUH finding.
Add tests for the ranking and for the "no finding" state.
```

---

## Prompt 6: Fix the clinic-access metric

```
Use the Prompt 1 results. Do not guess; if the data needed is not available, tell me.
1. Categories: if polyclinics are excluded, either add them from an official open dataset (e.g. data.gov.sg) or add a prominent label on the map and table saying "CDMP GP clinics only; polyclinics not included". Do not present the ratio as total chronic-care capacity.
2. Dates: the clinic list is from June 2024 and the population from June 2026. Check data.gov.sg for a newer clinic list. If there is none, show both dates side by side on the map caption, not only in the "More about" section.
3. Small denominators: add a confidence indicator or suppress areas under a justified minimum 65+ population (explain the threshold, with a sensitivity check on 1,000 vs 2,000 vs 3,000). Mark areas with a daytime/commuter effect (e.g. Rochor, Downtown fringe) where residents-based ratios mislead.
4. Define the "benchmark rate" in the Hougang sentence on the page, or remove that sentence.
5. Colour scale: change to a clear sequential scale with a plain legend. Decide whether "darker = fewer" is confusing for ordinary users and justify the choice either way; add direct labels for the lowest and highest areas.
6. Add one line stating that clinic counts do not capture opening hours, doctors, cost or transport.
Update tests, data dictionary and methodology.
```

---

## Prompt 7: Data freshness and the weekly claim

```
Based on Prompt 1 findings on missed or lagging releases:
1. Fix whatever caused the missed run (workflow schedule, failing check, secrets, source lag).
2. On the site, replace the vague "Due an update" badge with an explicit status: "Latest data: <date>. MOH last published: <date>. Next check: <date>". If the source lags, say so ("MOH publishes with about X days delay").
3. Add a workflow that opens a GitHub issue or sends a notification if no new release has been published for more than 10 days.
4. Change README/site wording from "weekly-updated" to what is actually true.
Add a test for the freshness status states (fresh, source lagging, stale).
```

---

## Prompt 8: Copy and trust consistency

```
1. Fix the Explore card "check live waits" vs the disclaimer "doesn't show current hospital availability". If live NUH estimates exist, label them "NUH estimate, NUH only, updated <time>" and keep the disclaimer specific. If not, remove the words "live" everywhere.
2. Search the whole web/ and docs/ for "live", "real-time", "current", "weekly", "independent" and review each use for accuracy.
3. Rename "Independent audit" to something accurate such as "AI-assisted traceability audit (run by the author)". Add its limits to the audit report: 20-number sample, same author, no human reviewer. If possible, add a short list of what a human reviewer should check.
4. Keep the 995 emergency link and the not-medical-advice line prominent on every page.
List every change with file paths.
```

---

## Prompt 9: Sync the README and docs to the live product

```
1. Using Prompt 1 part (c), update README.md, docs/case_study.md, docs/methodology.md and docs/data_dictionary.md so every number, hospital count and date matches the current release.
2. Replace the 12.7-hour screenshot (docs/images/overview.png) with a fresh one, or remove it. Provide the exact Playwright command to regenerate screenshots.
3. Remove hard-coded figures from the README where they will go stale; link to the live site or generate them from the release at build time.
4. Add a CI check that fails if README figures differ from the latest release manifest.
```

---

## Prompt 10: Audience, navigation and footer

```
Decision needed from me first: propose two options and wait. Option A: public tool for general readers and policy audiences, portfolio material moved to an /about page. Option B: portfolio-first with a clear "for recruiters" framing. Recommend one.
After I choose:
- Reduce the nav and footer. Merge overlapping pages (Findings, Case study, Project in 60 seconds, Summary, About) and remove duplicates; add redirects.
- Remove Style guide and Decision records from the public footer (keep them in the repo or under a noindex route).
- Keep the CV link only where it fits the chosen audience.
- Make sure every page has one clear purpose, and give me a before/after sitemap.
```

---

## Prompt 11: Plain-English pass

```
1. List every unexplained acronym or jargon term on each page (CDMP, ED, UCC, MOH, median, planning area).
2. Define each once on first use in plain words, then use the short form; remove repeated inline glossary pop-ups (e.g. MOH defined twice on the homepage).
3. Rewrite the longest headline and caption sentences to under ~25 words, reading level around Grade 8.
4. Reconsider the name "Care-pacity" for search: keep the brand if you like it, but add a descriptive subtitle and page title such as "Singapore ED bed waits and clinic access for seniors" under 60 characters.
5. Explain, within the Alexandra UCC and NUH adult-only caveats, why they are excluded from the comparison, in one line each, visible without hovering.
```

---

## Prompt 12: Performance, hosting and resilience

```
Measure before changing anything: run Lighthouse on /, /findings, /explore and /find on mobile throttling and report LCP, JS size per route, and API response times, including a cold start of the Render service if it is on a free tier.
Then:
1. Lazy-load the three.js 3D map only when a user opens it; make sure the default 2D view ships no three.js.
2. If cold starts exceed ~3 seconds, either pre-render API-backed pages at build time (static data from the latest release) or add a keep-alive/health ping, and show a graceful loading state.
3. Make the site degrade gracefully (last cached release + a stale banner) if the API is down.
4. Report the budget before and after. Do not remove features without asking.
```

---

## Prompt 13: Honest engineering narrative

```
1. In the README, state plainly which parts of the project were AI-assisted (CLAUDE.md exists), and what I personally decided or verified. Do not invent my contribution; give me a template with blanks for me to fill in.
2. Prepare a "limitations and what I'd do next" section: no age-specific ED data, no link between clinics and ED use, CDMP-only clinic count, noisy weekly waits.
3. Add a short "questions a reviewer might ask" file for me (docs/interview_notes.md): the three weakest points and how I would answer them honestly.
4. Remove any wording that claims more rigour than the evidence supports ("independent", "tested findings") unless backed by the Prompt 8 changes.
```

---

## Prompt 14: Final pre-publish QA (run last)

```
Final release check, change nothing unless a fix is trivial:
1. Run make test, Lighthouse CI and the Playwright accessibility checks at 1280px and 375px.
2. Click through every internal link and every external link; report broken links, 404s and redirects.
3. Search all pages for: stale dates, "TODO", lorem ipsum, "live", unfinished sections, hard-coded numbers that differ from the latest release.
4. Confirm the Prompt 1 claims now read as "confirmed fixed" or "documented limitation", with evidence.
5. Confirm robots/noindex on developer-only pages, correct OG image text, and the privacy statement matches actual third-party requests (OneMap, Vercel, Render).
6. Produce a go / no-go checklist with any blockers listed.
```
