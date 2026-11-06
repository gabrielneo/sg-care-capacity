# Language rules

How every public page on the site talks to readers. Prompt 8A turns this file into
`docs/glossary.yml`, the `<Term>` component and the terminology lint.

## Why these rules exist

The site is read by four audiences: members of the public, recruiters, BA hiring
managers and technical interviewers. Healthcare abbreviations stay, because they show
domain knowledge to a Synapxe reader. Each one is spelled out the first time it appears
on a page, and explained on hover after that. Internal and technical jargon never
reaches a public page.

## Rule 1: Keep the abbreviation

Spell it out on first use per page (for example, "Community Health Assist Scheme (CHAS)").
After that, show the abbreviation with a hover definition.

| Abbreviation | First use on a page reads | Plain-English hover |
| --- | --- | --- |
| ED | Emergency Department (ED) | The hospital's 24-hour emergency unit |
| MOH | Ministry of Health (MOH) | Singapore's health ministry; publishes the bed-wait data |
| CHAS | Community Health Assist Scheme (CHAS) | Government subsidies at private GP and dental clinics |
| CDMP | Chronic Disease Management Programme (CDMP) | Lets patients with long-term conditions such as diabetes use MediSave at the clinic |
| HAS | Health Appointment System (HAS) | TODO(me): one-sentence definition from the official source |
| UCC | Urgent Care Centre (UCC) | Treats urgent but non-life-threatening cases; Alexandra Hospital runs one instead of a full ED |
| NUHS | National University Health System (NUHS) | One of the three public healthcare clusters that run the hospitals |
| NHG Health | NHG Health | One of the three public healthcare clusters that run the hospitals; called National Healthcare Group until July 2025 |
| SingHealth | SingHealth | One of the three public healthcare clusters that run the hospitals |
| Healthier SG | Healthier SG | The national programme for residents to enrol with one family doctor |
| Polyclinic | Polyclinic | Government primary care clinic |
| GP | General practitioner (GP) | A family doctor who treats everyday health problems in the community |
| URA | Urban Redevelopment Authority (URA) | Singapore's land-use planning agency; it draws the planning areas used on the map |
| HPB | Health Promotion Board (HPB) | The government board for health promotion; its screening-centre list is used to find polyclinics |
| SGT | Singapore Time (SGT) | Singapore's time zone, 8 hours ahead of UTC |

### Hospital codes

MOH's short codes for the 9 public emergency departments. Full names and clusters come from MOH's
reference list (`dim_hospital`).

| Abbreviation | First use on a page reads | Plain-English hover |
| --- | --- | --- |
| AH | Alexandra Hospital (AH) | Alexandra Hospital's urgent care centre, run by NUHS |
| CGH | Changi General Hospital (CGH) | Public hospital emergency department, run by SingHealth |
| KTPH | Khoo Teck Puat Hospital (KTPH) | Public hospital emergency department, run by NHG Health |
| NTFGH | Ng Teng Fong General Hospital (NTFGH) | Public hospital emergency department, run by NUHS |
| NUH | National University Hospital (NUH) | Public hospital emergency department, run by NUHS; MOH's figures cover adults only |
| SGH | Singapore General Hospital (SGH) | Public hospital emergency department, run by SingHealth |
| SKH | Sengkang General Hospital (SKH) | Public hospital emergency department, run by SingHealth |
| TTSH | Tan Tock Seng Hospital (TTSH) | Public hospital emergency department, run by NHG Health |
| WH | Woodlands Hospital (WH) | Public hospital emergency department, run by NHG Health; in MOH's figures from June 2024 |

## Rule 2: Keep the word, explain it once

These terms carry the argument, so replacing them would lose meaning. Show the
explanation on first use per page.

| Term | Explanation shown on first use |
| --- | --- |
| Right-siting | Treating people in the most suitable place, such as a GP clinic rather than a hospital, when it is safe to do so |
| Super-aged society | A society where 21% or more of people are aged 65 or over |
| Median | The middle value: half of patients waited longer, half shorter |
| Bed wait / boarding | Time a patient spends in the ED after a doctor decides to admit them, waiting for a ward bed |

## Rule 3: Replace on public pages

Keep the internal term only on the Methodology and technical detail pages.

| Internal term | Public pages say |
| --- | --- |
| median_wait_hours, "ED wait" | Time waiting for a ward bed after the decision to admit (daily median, hours) |
| attendances | ED visits |
| mean of daily medians | Average of each day's median |
| clinics_per_1k_seniors | CHAS GP clinics per 1,000 residents aged 65+ (only CHAS clinics are counted, so "GP clinics" alone would overstate it) |
| planning area | Area (URA planning area) on first use, then "area" |
| choropleth, heatmap | Never shown; say "map shaded by..." |
| quantile breaks | Five groups with equal numbers of areas |
| as_of, snapshot | Data as of [date]; weekly data release |
| statistically significant | Unlikely to be chance (p < 0.05) |
| ecological fallacy | Area averages don't describe individual people |
| imputed / interpolated | We never fill in missing days; gaps stay gaps |
| KPI | Key number |

## Rule 4: The bed-wait metric

Wherever the bed-wait metric appears, its label is "Time waiting for a ward bed after
the decision to admit", with the unit "hours, daily median". The first chart on a page
that uses it carries this explainer:

> This is not the time to see a doctor. It measures how long admitted patients wait in
> the ED for a ward bed.

## Rule 5: Wording

- No causal words in findings: never "causes", "drives", "leads to" or "because".
  Use "moves with", "is associated with" or "is higher in".
- Direction words ("better", "worse") depend on the metric. More clinics is better;
  a longer bed wait is worse.
- Colour never carries meaning alone; pair it with an arrow and a word.

## Rule 6: Writing style

- Sentences under 25 words.
- Reading level around Grade 8 to 9 (warn above Grade 10).
- Every number has a unit.
- No database table or column names in page text.
- Every number shown carries "Data as of [date]" and its source.

## Maintaining this file

- Add a term here before it appears on a public page. The lint fails on any
  abbreviation without a `<Term>` wrapper.
- If a replacement would weaken a clinical meaning, keep the original term and add
  it to Rule 2 instead.
- Definitions taken from an official source get a `source_url` in `docs/glossary.yml`.
