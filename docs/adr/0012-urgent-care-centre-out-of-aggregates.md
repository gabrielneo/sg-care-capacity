# 0012: Leave the urgent care centre out of every figure across hospitals

**Status:** Accepted · **Date:** 2026-11-14

## Context

Alexandra Hospital (AH) runs an Urgent Care Centre (UCC), not a full emergency department. Its bed
waits are shorter by design, and its patients are a different mix. The site already left it out of
some figures across hospitals (the longest bed wait, the median across hospitals, the all-hospital
band on ED Trends) but kept it in others:

- "Hospitals above usual" and the site strip counted it ("1 of 9 hospitals busier than usual").
- "Largest change against usual" included it, on the grounds that each hospital is compared with itself.
- The card order and the insight engine's headline findings could put it first. In the release of
  9 Nov 2026, the second headline finding was an unusual week at Alexandra Hospital.

So the same page could say the centre "isn't ranked" in one tile and rank it in the next. A reader
comparing the nine sites can't tell which figures include it.

## Decision

- **One rule everywhere: the UCC is never in a rank, count, median or "largest change" across
  hospitals.** That includes the site strip, the summary tiles, the card order, the ED Trends heatmap
  order, the home page's takeaways and the insight engine's headline findings.
- **It is still shown, in its own group** headed "Urgent care centre", with the line "Not compared
  with full emergency departments". Its own figures, its own usual level and its status badge
  (against itself) stay.
- **The insight engine still runs on it.** Its findings carry `scope = urgent_care`, are labelled as
  urgent-care findings, and never get a headline rank. The pooled weekday finding ("across all
  hospitals") leaves it out.
- **One source of truth:** `dim_hospital.facility_type` (`ED` or `UCC`) from `config.HOSPITAL_REFERENCE`,
  checked by `reference.hospital` and served by the API. The site decides with one helper,
  `rankableHospitals()` in `web/lib/hospitals.ts`; no page tests the code `"AH"`.

## Alternatives considered

- **Keep it in comparisons with itself** (largest change, counts of badges). Rejected: "largest change
  across hospitals" is still a ranking of hospitals, and a count of "N of 9" invites comparing the
  nine. A reader can't see which figures compare a site with itself.
- **Drop it from the site.** Rejected: it is in MOH's figures, and people near it need its numbers.

## Consequences

- Counts read "of 8 emergency departments" instead of "of 9 hospitals".
- Headline findings can change when this ships: the next-ranked ED finding takes the centre's place.
- Leaving it out of the pooled weekday finding changes that finding's p-value, and so the
  Benjamini-Hochberg adjustment of every other finding's p-value in the same run, slightly.

## How it is enforced

- `reference.hospital` (pipeline, blocks publishing): every site has a facility type of `ED` or `UCC`.
- `web/lib/hospitals.test.ts`: every aggregate helper is fed a UCC hospital and leaves it out.
- `pipeline/tests/test_insights.py`: a UCC finding never gets a headline rank, is scoped
  `urgent_care`, and is not in the pooled weekday finding.
