# Comprehension report: four personas on the live site

**Run:** 2026-11-08, on data release `data-2026-11-08`. Production build of the site at
`localhost:3000`, reading the API on the real snapshot.

## Method

Four AI agents each browsed the running site as one persona, in parallel.

**What each agent could see:**
- Each got only the site's address, its persona and a time budget.
- It browsed through a screenshot helper that could open pages on the site and nothing else. Links
  to GitHub or anywhere outside the site were blocked.
- It was told not to read the source code, `docs/`, `CLAUDE.md` or the API, and to judge only from
  what it saw on screen.

**Time budgets** were enforced as caps on what the agent could look at:

| # | Persona | Device | Budget | Cap | Used |
|---|---|---|---|---|---|
| 1 | Member of the public, aged 60, no healthcare background | Phone, 375 px | 10 s on the landing page | 2 screenshots, no taps | 2 screenshots |
| 2 | HR recruiter screening for a BA role, not clinical | Desktop | 30 s | 4 screenshots, 1 hover, 1 click | 4 screenshots, 1 hover |
| 3 | BA hiring manager at a national HealthTech agency | Desktop | 3 min | 14 screenshots, 4 hovers | 14 screenshots, 2 hovers |
| 4 | Data engineer interviewer | Desktop | 10 min | 35 screenshots, 10 hovers | 30 screenshots, 3 hovers |

Each agent's summary was compared with the top 3 findings from `/api/v1/insights?headline=true`.
Every factual claim an agent made was then checked against the data or the page text before it
went into this report. Where a claim turned out to have a different cause, the "Checked" column
says so.

**Limitations:**
- **Role-play is not user research.** The agents know more than the people they play. They were
  told to stay inside each persona's knowledge, but persona 1 and 2 confusions are probably
  *under*-counted.
- **Possible leak of project context.** Claude Code may give agents the project's `CLAUDE.md` as
  background. The agents were told to ignore any project description, but it can't be proven that
  none reached them.
- **One run per persona,** so there is no spread of results.
- **Time is simulated** as a number of screenshots, not measured.

## The real top findings

From `/api/v1/insights?headline=true`:

| Rank | Finding | Key number |
|---|---|---|
| 1 | At Sengkang General Hospital, bed waits are longest on Tuesdays, 43% above its weekly average. | 12.7 hours (average bed wait on Tuesdays) |
| 2 | Bed waits at Alexandra Hospital were unusually long in the week of 19–25 Oct 2026: 2.1 hours. | 2.1 hours (against 1.4 usual) |
| 3 | At National University Hospital, bed waits move moderately with ED visits the day before. | 0.39 (correlation) |

## Did each persona get the main finding?

A persona is marked **FAIL** if their one-sentence summary doesn't match finding 1.

| Persona | Their main finding, in their words | Matches finding 1? |
|---|---|---|
| 1. Public, phone | "At Sengkang General Hospital, people wait longest for a bed on Tuesdays: 12.7 hours, against about 9 hours normally." | **Pass** |
| 2. HR recruiter | "At Sengkang General Hospital, patients wait longest for a ward bed on Tuesdays: 12.7 hours, against 8.9 hours on an average day of its week, which is 43% higher." | **Pass** |
| 3. BA hiring manager | "At Sengkang General Hospital, bed waits are longest on Tuesdays: 12.7 hours, 43% above its weekly average of 8.9 hours." | **Pass** |
| 4. Data engineer | "At Sengkang General Hospital bed waits peak on Tuesdays, averaging 12.7 hours against 8.9 for the week overall (43% higher)." | **Pass** |

**No persona failed.** Three near-misses show how the hero can be misread:
- **12.7 as a national figure.** Persona 2 first read 12.7 hours as a national figure, because
  the number appears before the hospital is named. Persona 1 said they could have taken it as
  the wait at every hospital.
- **"Longest on Tuesdays" may oversell.** Personas 2 and 3 pointed out that Wednesday is 12.6, a
  near-tie.
- **A system-wide pattern under one hospital's name.** Persona 4 noted that almost every
  hospital peaks on Tuesday. Changi General's Tuesday peak (+60%) and Ng Teng Fong's (+46%) are
  both larger than Sengkang's +43%.

None of the four put findings 2 or 3 in their one sentence. That's expected, since they were asked
for *the* main finding.

## What each persona understood

### 1. Member of the public, 60, phone, 10 seconds

- **Bed wait:** *not understood from the first screen.* They guessed it was the wait for a
  hospital bed after arriving, or the time to see a doctor at A&E. The plain definition only
  appeared after one scroll, in small grey text.
- **Trust:** partly. Naming MOH and SingStat with dates helped. Three things undermined it:
  - the contradicting freshness badges;
  - "p < 0.001";
  - "waiting for the author's review", which made the site feel like a draft.
- **Main confusions:**
  - "Right-siting".
  - "super-aged".
  - "ED", where locals say A&E.
  - The "Ageing" badge, read as a topic tag.
  - "This is not the time to see a doctor", read as advice.
  - 4.2 million residents, which looks wrong against a population of about 6 million.

### 2. HR recruiter, BA role, 30 seconds

- **Bed wait:** understood correctly, but only after hovering over the term and scrolling.
- **Trust:** partly. Sources and caveats read as careful. Three things undermined it:
  - the 19.5% against the 21% "super-aged" line;
  - the case study's 2.5–6.2 h range against Sengkang's 8.9 h;
  - a chart with no y-axis.
- **Would pass the candidate on:** "Probably yes, with a note". The case study's contents are
  exactly BA language, but the page opens with a draft banner listing 46 unfinished items.

### 3. BA hiring manager, 3 minutes

- **Bed wait:** understood correctly, including that MOH doesn't state the unit, so "hours" is the
  candidate's reading.
- **Trust:** partly.
  - **For:** a source and date on every number, a visible data-quality gate, and honest scoping.
  - **Against:**
    - figures that don't reconcile across pages (release IDs, check counts, warning counts, dates);
    - the 19.5% "super-aged" claim;
    - a near-tie as the headline;
    - the inferred unit.
- **What the candidate seems good at:**
  - **Data literacy and statistical caution:**
    - findings are published only if they pass a test;
    - each hospital is compared with its own baseline;
    - the weekday pattern is removed before correlating.
  - **Plain-language definitions** that prevent misreading.
  - **Honest scoping:** "What this data can't tell you".
  - **Domain grounding:** the UCC, adults-only NUH, Woodlands' start date, CHAS and CDMP, URA
    planning areas.
  - **Data governance:**
    - no patient data, and gaps never filled;
    - lineage on every record;
    - "Must" requirements tied to tests;
    - a decision log.
  - **An as-is patient flow** that marks where each measure is taken.
- **What is missing for a BA role:**
  - **The core BA work is unwritten.** The case study's 46 TODO items include the problem
    statement in the candidate's own words, stakeholder interests, both personas, the to-be flow,
    Should/Could priorities, metric targets and outcomes.
  - **No stakeholder evidence:** no interviews, and no named user or decision. "Who acts: Not
    shown yet" appears on every finding.
  - **Requirements are only non-functional and data-principle items.** They are sourced to
    "CLAUDE.md", which prompts the question of what the candidate wrote and what an AI tool
    generated.
  - **Success metrics are pipeline health only.** There is no adoption or decision-impact measure.
  - **No operational "so what".** For example, a Tuesday/Wednesday peak usually points to weekend
    discharge lag.
  - **Engineering text leaks into BA pages:** test file names, ADR numbers, check IDs.

### 4. Data engineer interviewer, 10 minutes

- **Bed wait:** understood correctly. It is MOH's daily median, from the decision to admit to
  leaving the ED. It covers admitted patients only, and the site averages these daily medians by
  weekday or by week.
- **Trust:** partly. They would believe the pipeline design exists:
  - an immutable raw zone with SHA-256 hashes;
  - records set aside rather than fixed, and lineage;
  - row-count reconciliation;
  - Benjamini-Hochberg, robust z-scores and Mann-Kendall with an autocorrelation correction;
  - a Data Quality page that shows real failures.

  Against that:
  - the site contradicts itself on dates, release IDs, check counts, warning counts and freshness;
  - the headline series is the most volatile one;
  - "this week's" is attached to 2-week-old and 2-year-old data;
  - TODOs and AI-assistant notes appear on public pages;
  - there is no link to the repo or the tests.

  They would want the repo, a test run and a lineage trace for the 12.7 before believing the
  headline.

## Confusions, ranked by how many personas hit them

"P1"–"P4" are the personas.

| Count | Confusion | Where | Who | Checked |
|---|---|---|---|---|
| 4 | **"Ageing · 2 weeks old" read as a topic tag** ("ageing population"); it seems to contradict "Up to date · 4 months old" | Overview hero, every chart footer | P1–P4 | True. These are different cadences (weekly, annual, live) and different as-of dates. The hero uses the end of the analysed week (25 Oct, 14 days old, so amber), while ED Trends uses MOH's latest day (31 Oct, 8 days, so green). A 1.9-day-old live reading shows as "1 day old" (amber) because days are rounded down. |
| 4 | **"Right-siting" never explained** where it first appears | Site title, every page | P1–P4 | True. It is only explained by hovering in the Case Study heading, or in the Glossary. |
| 4 | **"Who acts: Not shown yet: …waiting for the author's review"** reads as an unfinished placeholder | Overview, all three finding cards | P1–P4 | True. No action has been reviewed yet (`docs/insight_actions.yml`). |
| 4 | **19.5% against "super-aged"**: "This share is what defines a super-aged society", but the definition says 21% or more | Overview, "Why now" | P1–P4 | True. 19.5% is for all residents. The 21.4% citizen figure is only in the Case Study. |
| 4 | **"adjusted p < 0.001"** is jargon: adjusted for what? | Overview, Finding 1 | P1–P4 | True. It is a Benjamini-Hochberg correction across 46 tests, explained only on the method page. |
| 4 | **12.7 hours read as a typical, national or this-week wait** | Overview hero | P1–P4 | True. It is one hospital's average Tuesday over 26 weeks (27 Apr to 25 Oct). |
| 4 | **Navigation labels "Access Map" and "Live"**: access to what? Live what? "Live" also contradicts the page's own "not live" banner. | Top menu; Live page | P1, P2 (unclear); P3, P4 (contradiction) | True |
| 3 | **"ED" / "A&E"**: ED isn't spelled out in the menu, and locals say A&E; "A&E" and "EMD" appear unexplained in the Methodology | Menu; Methodology sources and MOH definition | P1, P2, P4 | True |
| 3 | **"Longest on Tuesdays" oversells**: Wednesday is a near-tie, and the pattern is system-wide | Overview Finding 1; ED Trends heatmap | P2, P3, P4 | True. Tuesday is 12.70 and Wednesday 12.59. Sengkang ranks first by the *consistency* of its pattern (ε² 0.495), not its size: Changi General is +60% and Ng Teng Fong +46%. |
| 3 | **"2.1 hours, unusually long" reads as short** next to 12.7 | Overview Finding 2 | P2, P3, P4 | True. It is unusual *for this urgent care centre*: 2.14 against a usual 1.37, or +56%. "2.1 against 1.4" reads as +50% because of rounding. |
| 3 | **0.39 "moderate link"**: is it 39%? hours? Moderate compared with what? | Overview Finding 3 | P2, P3, P4 | True |
| 3 | **Figures don't reconcile across pages** | Case Study, Data Quality, Overview | P2, P3, P4 | True, with explained causes (below the table). |
| 3 | **"this week's data release" / "this week's findings"** on older data | Overview eyebrow; Access Map key | P1, P2, P4 | True. It refers to the weekly release, not the week of the data. |
| 3 | **Developer artefacts on public pages** | Case Study, Methodology, insights method, Data Quality, Glossary | P2, P3, P4 | True (examples below the table). |
| 2 | **"Average of the daily medians"** is hard to explain | Overview and ED Trends chart subtitles | P2, P3 | True |
| 2 | **Small-multiple axis "+10.8 / −8.5"** could be read as absolute hours | ED Trends, small multiples | P3, P4 | True. It is hours above or below each hospital's own usual level. |
| 2 | **Finding 2's line chart has no y-axis,** so 1.4 to 2.1 looks like a spike | Overview Finding 2 | P2, P4 | True. Annotated line charts don't start at 0 and show no axis values. |
| 2 | **Unit inferred:** "typical value is about 4" sits beside Sengkang's 8.9 | ED Trends footer caveat | P3, P4 | True |
| 2 | **Live page against MOH:** NUH estimate 20 h vs MOH ~5.6 h; "Alexandra Hospital: Adult Emergency" vs UCC everywhere else | Live page | P3, P4 | True. The label is NUHS's own; the measures differ. |
| 2 | **Access Map side charts:** "national rate" is ambiguous (the median line is 1.2); the priority order differs from the shortfall order | Access Map quadrant and shortfall bars | P3, P4 | True. Priority is many seniors and few clinics per senior; the bars are sorted by shortfall. |
| 2 | **Healthcare jargon** without a gloss | Glossary, Methodology | P2, P4 | True. Examples: "boarding", "triage", "acuity", "case mix", "MediSave". |
| 1 | **"4,240,430 residents"** looks wrong against ~6 million | Overview, "Why now" | P1 | True. It is citizens and permanent residents only, explained in small print below. |
| 1 | **"This is not the time to see a doctor."** read as advice | Overview, Findings intro | P1 | True. "This" has no clear referent. |
| 1 | **"weekdays"** read as Monday to Friday | Overview, Finding 1 caveat | P1 | True |
| 1 | **"admitted patients"**: already given a bed, or told they need one? | Overview, Findings intro | P1 | True |
| 1 | **"passed a fixed statistical check"**: which check? | Overview, Findings intro | P1 | True |
| 1 | **"Why now"**: why now what? | Overview heading | P1 | True |
| 1 | **"SingStat"** not spelled out, unlike MOH | Overview source line | P1 | True |
| 1 | **Hospital codes without names** in the ED Trends filter (WH especially) | ED Trends, hospital checkboxes | P3 | True |
| 1 | **"Tall and dark areas need attention first"** reads as a policy claim | Access Map reading guide | P3 | True |
| 1 | **The 2D map defaults to CHAS clinics, the 3D map to CDMP clinics,** on the same colour ramp | Access Map | P4 | True |
| 1 | **Legend groups look overlapping** ("1.10 – 1.24" and "1.24 – 1.36") | Access Map 3D legend | P4 | True. Values differ only past 2 decimals. |
| 1 | **Glossary "Source" with no definition** | Glossary | P4 | Partly. It is the source link for "super-aged society", drawn on its own line, so it looks like a term with no definition. |

**Figures that don't reconcile across pages:**

| What a reader compares | Shown | Why they differ |
|---|---|---|
| Typical bed wait | Case Study: 2.5–6.2 h in 2025. Overview: Sengkang's weekly average of 8.9 h. | Different year and different statistic. The Case Study uses each hospital's 2025 median day (Sengkang's was 4.81 h). The Overview uses the 2026 26-week mean (median 8.04 h). |
| Release ID | Case Study: `data-2026-11-06`. Data Quality: `data-2026-11-08`. | The Case Study is static text from an older release. |
| Checks | Case Study: "0 of 69 checks" blocking. Data Quality: 77 checks. | The same static text. |
| Data-quality warnings | Overview: "4 warnings apply". Data Quality: 3 warnings. | The Overview counts the quarantined clinic record as a warning; the Data Quality page lists it separately. |

**Developer artefacts on public pages:**
- "CLAUDE.md" in `docs/methodology.md:131` and `docs/case_study.md:149`.
- First-person assistant notes in `docs/insights_method.md:242`: "operator I couldn't confirm",
  "awaits the author's approval".
- "TODO(me)" for HAS in the glossary.
- Test file names and check IDs in the Case Study and on Data Quality.

**Felt like decoration** (not counted as confusion):

| Item | Who |
|---|---|
| The yellow highlighter on "19.5%" | P1, P2, P3 |
| Freshness pills and provenance lines repeated on every tile; the four identical footers on the Data Quality counters | P2, P3, P4 |
| Large empty gaps between the Overview's finding cards (the scrollytelling spacing), read as a broken layout | P2, P3, P4 |
| The 3D map: hard to read values or compare areas | P3, P4 |
| Finding 1's card repeating the hero | P1, P3 |
| The reading-time cards | P3 |
| The coverage grid of identical squares | P4 |
| The tautological "Failures that stop publishing: 0" tile | P4 |

## Suggested wording fixes

These are suggestions only; no file other than this report was changed. Where the fix needs a data
or engine change rather than a wording change, the "Where" column says so.

| Problem (personas) | Now | Suggested | Where |
|---|---|---|---|
| Freshness badge (4) | "Ageing · 2 weeks old" / "Up to date · 4 months old" | Name the cadence and avoid "Ageing": "Weekly data · 2 weeks old: due an update" / "Yearly data · 4 months old: current". Date the Overview hero by MOH's latest day, and show the analysis window separately. | `FreshnessBadge`, `lib/freshness.ts`; Overview hero |
| Right-siting (4) | Site title only | Add a one-line strap under the title: "Right-siting care: treating people in the most suitable place, such as a GP clinic rather than a hospital, when it is safe to do so." | Layout header or Overview |
| Who acts (4) | "Who acts: Not shown yet: the suggested action is waiting for the author's review." | Hide the line until an action is reviewed, and say once in the Findings intro: "Suggested actions will be added after review." Better: review `docs/insight_actions.yml`. | `Sections.tsx` (StepText), `lib/story.ts` |
| 19.5% vs super-aged (4) | "This share is what defines a super-aged society." | "A society is called super-aged when 21% or more are 65 or over. Among residents the share is 19.5%; among citizens alone it is higher." Cite the citizens' figure only if it comes from data with a source. | Overview `WhyNow`; possibly a citizens' series in the pipeline |
| p-value (4) | "This is unlikely to be chance (adjusted p < 0.001)." | "This is very unlikely to be chance: less than 1 in 1,000, after allowing for the 46 tests run." Keep the p-value for the method page. | `templates.yml` (engine) |
| Hero number (4) | "The top finding in this week's data release" / "12.7 hours" / "Average bed wait on Tuesdays" | Eyebrow: "The strongest pattern in the latest MOH data". Label above the number: "Sengkang General Hospital: average Tuesday bed wait, 27 Apr – 25 Oct 2026". | Overview `Hero`; `metric_label` in `templates.yml` (add the window) |
| Navigation labels (4) | "ED Trends", "Access Map", "Live" | "Emergency waits", "Clinic access", "Latest NUHS readings" | `lib/nav.ts` |
| ED / A&E (3) | "Emergency Department (ED)" | Add the local term on first use: "Emergency Department (ED, often called A&E)". Add A&E and EMD to the glossary as aliases of ED. | `docs/glossary.yml` |
| Tuesday near-tie, system-wide pattern (3) | "…longest on Tuesdays, 43% above its weekly average." | When the second-highest day is within 5% of the peak, name both: "…longest on Tuesdays and Wednesdays". In the hero, say why this hospital leads: "ranked first because its weekly pattern is the most consistent". Consider leading with the all-hospital finding ("Across all hospitals, bed waits are longest on Tuesdays"). | `templates.yml` and `detectors/weekday.py` (engine); Overview copy |
| 2.1 hours (3) | "…were unusually long in the week of 19–25 Oct 2026: 2.1 hours." | "Bed waits at Alexandra Hospital's urgent care centre were unusually long for it in the week of 19–25 Oct 2026: 2.1 hours, against a usual 1.4." | `templates.yml` (engine) |
| Correlation (3) | "0.39" / "moderate link" | Lead with words: "Moderate link (0.39, on a scale from −1 to 1)". Add "correlation" to the glossary. | `templates.yml`, `docs/glossary.yml` |
| Figures that don't reconcile (3) | Static Case Study figures | Mark each Case Study figure with its year, statistic and release ("2025, median day, release data-2026-11-06"), or generate them from the current release. On the Overview, say "3 warnings and 1 record set aside" to match Data Quality. | `docs/case_study.md` (author); `Provenance` |
| "this week's" (3) | "this week's data release" / "this week's findings" | "the latest weekly data release" | Overview, Access Map copy |
| Developer artefacts (3) | "which CLAUDE.md rules out"; "(CLAUDE.md)"; "operator I couldn't confirm"; "awaits the author's approval"; HAS "TODO(me)" | "which the project's data principles rule out"; "(the project's data principles)"; "whose operator could not be confirmed from a public source"; "not yet approved". Fill in the HAS definition, or remove the term until it has one. | `docs/methodology.md`, `docs/case_study.md`, `docs/insights_method.md`, `docs/glossary.yml` |
| Average of medians (2) | "Hours, average of each day's median" | "Hours: MOH reports each day's middle wait; this is the average of those days". | `lib/copy.ts`, chart subtitles |
| Small-multiple axis (2) | "+10.8" / "−8.5" | "+10.8 h above usual" / "−8.5 h below usual" | `SmallMultiples.tsx` |
| Line chart with no axis (2) | No values on the y-axis | Label the top and bottom of the axis in hours, as the small multiples do. | `AnnotatedChart.tsx` |
| Unit caveat (2) | "We read the values as hours, because a typical value is about 4." | "We read the values as hours: daily values run from about 1 to 24, which only fits hours." | `lib/copy.ts` (check the claim against the data first) |
| Live page (2) | "Alexandra Hospital: Adult Emergency"; "Estimated wait for a ward bed 20 hours" | Mark NUHS's own label as quoted, add "(NUHS's name; MOH counts it as an urgent care centre)", and repeat "a different measure from MOH's daily median" on each card. | Live page |
| Access Map side charts (2) | "Hougang: About 13 clinics short of the national rate"; priority vs shortfall order | Draw and label the national rate on the quadrant (1.27 per 1,000), distinct from the median line. Title the bars "Largest shortfall first", and the 3D labels "Priority (many seniors, few clinics per senior)". | `QuadrantChart.tsx`, `ShortfallBars.tsx`, `AccessViews.tsx` |
| Population count (1) | "That is 828,010 of 4,240,430 residents." | "That is 828,010 of 4,240,430 residents (citizens and permanent residents)." | Overview `WhyNow` |
| Explainer (1) | "This is not the time to see a doctor." | "The bed wait is not the time to see a doctor." | `lib/copy.ts` |
| "weekdays" (1) | "weekdays differ" | "days of the week differ" | `CAVEAT` in `detectors/weekday.py` |
| Policy claim (1) | "Tall and dark areas need attention first." | "Tall and dark areas have the most seniors and the fewest chronic-care clinics per senior." | `READING_GUIDE` in `AccessViews.tsx` |
| Legend groups (1) | "1.10 – 1.24", "1.24 – 1.36" | "1.10 to 1.24", "over 1.24 to 1.36", or one more decimal where groups touch. | `Map3DLegend.tsx`, `MapLegend.tsx` |
| Glossary "Source" (1) | "Source" on its own line | Inline: "…aged 65 or over. (Source)" | `GlossaryList.tsx` |

## What this means for the portfolio

- **The core message lands.** All four personas named the Sengkang Tuesday finding.
- **Personas 3 and 4 understood the bed-wait measure without help.** Personas 1 and 2 needed a
  scroll or a hover first.
- **The biggest risk is credibility, not comprehension.** The two readers whose judgement matters
  most for the role (personas 3 and 4) both said "partly", for the same reasons:
  - figures that don't reconcile across pages;
  - a near-tie presented as the headline;
  - developer and assistant artefacts on public pages;
  - an unfinished Case Study.
- **For a BA role specifically,** persona 3's gaps are the author's own work, which no wording fix
  replaces:
  - the problem statement in the author's own words;
  - stakeholders and personas from real conversations;
  - the to-be flow;
  - outcome measures.
