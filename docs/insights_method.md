# Insight method

How the insight engine (`pipeline/sg_health/insights/`) turns the marts into findings, and when it
stays silent. It runs inside `sg-health publish`, after transform and before the snapshot is built.
`sg-health insights` runs it on its own.

## Principles

- **Deterministic code from the marts.** Every number comes from a query and a fixed method. No
  LLM writes, chooses or rephrases anything, and no number is typed in by hand.
- **No evidence, no sentence.** An insight that fails its statistical gate is not published. A
  weaker sentence is never written in its place.
- **No causal words.** Findings never say "causes", "drives", "leads to" or "because". They say
  "moves with", "is associated with", or "is higher in". The wording check rejects any sentence
  that breaks this rule, and the build stops.

## The run, step by step

1. **Inputs:** the marts (`fct_ed_weekly`, `fct_ed_daily`, `fct_area_access`, `fct_live_ed_snapshot`,
   `dim_hospital`), and the validation run being published.
2. **Input gate:** a detector is skipped if a check that **blocks publishing** failed on the raw
   tables behind it.
   - Row-level errors don't block the detector. Those rows were set aside, never corrected, so the
     detector runs and each insight carries a caveat saying how many records were set aside.
   - Today, one misplaced CHAS clinic is set aside, so access insights carry that caveat.
3. **Completeness gate:** a hospital or area with less than **80%** of its expected data is
   skipped. Weeks or days before a site was first reported (Woodlands, before 23 June 2024) don't
   count as missing.
4. **Detectors:** each one returns *candidates*, meaning tests or measurements.
5. **Multiple testing:** a single **Benjamini-Hochberg** correction runs across every p-value in
   the run, about 46 tests today (`scipy.stats.false_discovery_control`).
6. **Publication gate:** a candidate is published only if it passes its detector's effect-size
   minimum **and**, where it has a p-value, its adjusted p-value is below **0.05**. Within one
   detector, only the strongest result per hospital or area is published, for example the best of
   the three lags.
7. **Wording:** sentences come from `templates.yml`, with fixed rounding.
   - Hours are rounded to one decimal, percentages to whole numbers, and counts get thousands
     separators.
   - Singular and plural forms are chosen for you.
   - The hospital's or area's full name is used, not its code.
   - Each sentence is checked: a headline is one sentence of at most 20 words, a detail is at most
     two sentences, and neither may contain a causal word or a database column name.
8. **Actions:** `who_acts` and `action` come from [insight_actions.yml](insight_actions.yml), and
   only from entries marked `reviewed: true`. The engine never writes them. Until an entry is
   reviewed, the insight is published without an action, and a caveat says so.
9. **Ranking:** `rank_score` = normalised effect × (1 − p_adjusted) × completeness × recency.
   - The **normalised effect** puts each detector on a 0–1 scale:
     - trend: |Kendall's τ|;
     - anomaly: |z| / 7, capped at 1;
     - weekday: ε² / 0.14 (a "large" effect), capped at 1;
     - visits vs waits: |ρ|;
     - access gap: the priority score;
     - source gap: |gap| / 4 hours, capped at 1.
   - **Descriptive detectors** (no p-value) use 1 for (1 − p).
   - **Recency** is the source's freshness: green 1.0, amber 0.7, red 0.4. The June 2024 clinic
     list scores 0.4, so access findings rank lower; that's deliberate.
   - **The top 3, at most one per detector, are the headline findings.**
   - These weights are judgements. They're all in `thresholds.yml`.
10. **Logging:**
    - Every skip becomes a `dq_results` row in the published validation run. Its check is
      `insight.<detector>.<entity>`, with status `skipped` and the reason.
    - Every candidate, published or not, is listed with its outcome in `insights.json` (under
      `candidates`).
    - **Outputs:** `marts.fct_insight` and `insights.json` (a release file, hashed in the
      manifest).

## Why scipy

The tests here (Kendall's tau, Theil-Sen, Kruskal-Wallis, Spearman, Wilcoxon, Benjamini-Hochberg)
have well-known tested implementations in scipy. Writing them by hand risks quiet errors in tie
handling and p-values, and those errors would weaken the whole gate. The one piece written here is
the Mann-Kendall variance correction, which scipy doesn't offer; it's built on scipy's normal
distribution. scipy is a pipeline-only dependency: the API and the site don't use it.

---

## 1. trend

- **Question:** Are bed waits rising or falling at a hospital?
- **Method:**
  - **Data:** each hospital's weekly bed wait (the average of each day's median) over the last 26
    ISO weeks, up to the latest complete week. Complete weeks only.
  - **Size:** the Theil-Sen slope, in hours per week.
  - **Significance:** the Mann-Kendall test (Kendall's τ between time and value). Its variance is
    corrected for lag-1 autocorrelation using **Yue and Wang (2004)**: Var(S) is scaled by
    n / n* = 1 + 2 Σ (1 − k/n) ρ₁ᵏ. Here ρ₁ is the lag-1 autocorrelation of the series once its
    Theil-Sen trend is removed. The correction is applied only when ρ₁ > 0.
- **Gate:**
  - at least 20 complete weeks, and 80% completeness;
  - adjusted p < 0.05;
  - |slope| ≥ 0.05 hours a week (1.3 hours over 26 weeks).
- **Why this method:**
  - **Theil-Sen** is the median of pairwise slopes, so one extreme week can't tilt it.
  - **Mann-Kendall** asks only whether values tend to rise over time, with no assumption of a
    straight line or normal errors.
  - **Weekly bed waits are autocorrelated:** a bad week tends to follow a bad week. Uncorrected,
    the test would find "trends" in runs of similar weeks. The correction is conservative.
- **Limitations:**
  - **26 weeks is short:** a seasonal swing (e.g. a flu season) can look like a trend.
  - **The figure is an average of daily medians**, not a weekly median.
  - **What happened on the real data (data release of 8 Nov 2026):** SGH and SKH lean upward, but
    neither passes after the correction and BH (adjusted p 0.15 and 0.09). So no trend is published.

## 2. anomaly

- **Question:** Was the latest complete week unusual for that hospital?
- **Method:** the robust z-score of the latest complete week's bed wait, compared with the 8
  complete weeks before it: z = 0.6745 (x − median) / MAD (Iglewicz and Hoaglin).
- **Gate:**
  - the latest week and all 8 weeks before it must be complete;
  - |z| ≥ 3.5;
  - if the 8 weeks don't vary at all (MAD = 0), the hospital is skipped rather than given an
    infinite z.
- **Why this method:** the median and MAD aren't pulled by earlier unusual weeks, unlike the mean
  and standard deviation. 3.5 is Iglewicz and Hoaglin's recommended cut-off.
- **Limitations:**
  - **No p-value**, so it's outside the BH correction. With 9 hospitals checked weekly, an
    occasional flag by chance is expected.
  - **Eight weeks is a short baseline.**
  - **"Unusual" doesn't mean "bad practice":** a known event (a flu surge, a ward closure) may
    explain it, and the suggested action says so.

## 3. weekday

- **Question:** Is there a peak day for bed waits?
- **Method:**
  - **Test:** Kruskal-Wallis across the seven weekdays, using daily bed waits from complete weeks
    in the last 26 weeks.
  - **Effect size:** ε² = H / (n − 1).
  - **Peak day:** the weekday with the highest average, and how far it is above the hospital's
    overall average.
  - **Pooled across hospitals:** each hospital's values are first divided by its own average, so
    differences between hospitals don't hide the weekday pattern.
- **Gate:**
  - at least 12 complete weeks, and 80% completeness;
  - adjusted p < 0.05;
  - ε² ≥ 0.01 (a "small" effect).
- **Why this method:** Kruskal-Wallis compares ranks, so a few extreme days don't dominate, and it
  makes no assumption of normal waits. ε² reports the size of the difference, not just whether
  one exists.
- **Limitations:**
  - **The test shows that weekdays differ**; the peak day is descriptive, not tested separately,
    and a caveat says so.
  - **Holidays aren't separated out.**

## 4. volume_vs_wait

- **Question:** Do days with more ED visits come with longer bed waits?
- **Method:**
  - **Correlation:** Spearman's correlation between daily ED visits on day t and the bed wait on
    day t + lag, for lags 0, 1 and 2, per hospital, over the last 26 weeks.
  - **Weekday adjustment:** each hospital's weekday median is first subtracted from both series
    (decision recorded with the plan). Without it, the correlation mostly re-finds the shared
    weekly cycle that the weekday detector already reports.
  - **Strength labels:** negligible below 0.1, weak below 0.3, moderate below 0.5, strong above.
- **Gate:**
  - 80% of days with both figures, and at least 60 paired days;
  - adjusted p < 0.05;
  - not "negligible";
  - only the strongest passing lag per hospital is published.
- **Why this method:** Spearman measures whether the two rise and fall together, without assuming
  a straight line. Lags allow for admissions that reach a ward a day or two later.
- **Limitations:**
  - **An association, not a mechanism:** both series may follow a third thing, such as a flu
    season.
  - **Daily values are autocorrelated,** which overstates significance somewhat. The BH correction
    and the "not negligible" rule partly offset this.
  - **Visits include non-urgent cases**, while the bed wait covers admitted patients only.

## 5. access_gap

- **Question:** Which areas have the biggest CDMP clinic shortfall for their seniors?
- **Method:**
  - **National rate:** all CDMP GP clinics ÷ all residents aged 65+ (1.27 per 1,000 today).
  - **Expected** = residents aged 65+ × the national rate.
  - **Shortfall** = expected − actual.
  - **Priority** = percentile rank of residents aged 65+ × (1 − percentile rank of CDMP clinics
    per 1,000 seniors). Both ranks are among the included areas.
  - **The top 10 by priority** are listed.
- **Gate:**
  - areas with **fewer than 1,000 residents aged 65+ are excluded** and listed as excluded, with
    the reason (23 today, 13 of them with no seniors);
  - an area must be at least one clinic short;
  - there's no p-value: this is a ranking of measured figures, not a test.
- **Why this method:** the priority score favours areas that are both **large** (many seniors) and
  **under-served** (low access). A small area with an extreme ratio doesn't top the list, and a
  large area at the national rate doesn't either.
- **Limitations:**
  - **The data are from different dates:** clinics from June 2024, residents from June 2026.
  - **Clinics are counted where they are, not where patients go.**
  - **Area figures don't describe individual people.**
  - **The "national rate" is a reference point, not a target.**

## 6. regional

- **Question:** How do the cluster regions compare on clinic access and bed waits?
- **Status: off.** Bed waits by cluster are exact, from `dim_hospital`. But clinic access needs
  each planning area mapped to a cluster region, and **no official mapping is published**. MOH's
  2017 reorganisation names Central (NHG), Eastern (SingHealth) and Western (NUHS), without listing
  which planning areas belong to each.
- **Proposed method (agreed; the table itself awaits the author's approval):**
  - Assign each planning area to the cluster that runs the polyclinic in it, from each cluster's
    published polyclinic list.
  - Areas without a polyclinic go to the cluster of the nearest polyclinic (SVY21 distance).
  - The result is marked **approximate**.
- **The proposed table:** [regional_mapping.csv](regional_mapping.csv), 55 rows. For each area it
  gives the cluster, the basis (a polyclinic in the area, or the nearest one and its distance), and
  a source for the polyclinic's operator.
  - **Not yet approved.** Six areas rest on polyclinics whose operator I couldn't confirm from a
    source: Geylang, Hougang, Novena, Paya Lebar, Serangoon and Toa Payoh. They're marked
    `to verify`.
  - The detector stays off (`thresholds.yml`: `regional.enabled: false`) until the author approves
    the table.
- **Gate when on:** descriptive only (three regions, too few to test). A finding is published only
  if a region is both below the national access rate and above the national median bed wait.
- **Why this method:** regions are how clusters plan care, so a side-by-side comparison is the
  form a cluster can act on. With three regions there's nothing to test statistically, so the
  finding is stated as a comparison, never as a significant difference.
- **Limitations:**
  - **Patients don't only use their region's hospitals.**
  - **The mapping is an approximation.**

## 7. source_gap

- **Question:** Does NUHS's live bed-wait estimate match MOH's official daily figure for NUH?
- **Method:**
  - **Pairs:** the daily median of NUHS's adult-ED estimates for NUH, paired with MOH's NUH daily
    median on the same date.
  - **Statistic:** the median of the paired differences.
  - **Test:** Wilcoxon signed-rank.
- **Gate:**
  - at least 20 paired days;
  - adjusted p < 0.05.
- **Why this method:** a paired comparison removes day-to-day level changes. The signed-rank test
  assumes no particular distribution.
- **Limitations:**
  - **The two figures measure different things:** an estimate at one moment, against the day's
    median for admitted patients.
  - **Today there are 0 paired days.** The data release holds about one NUHS reading a week, and
    MOH's figures end a week earlier, so this detector will say nothing for months. Feeding the
    3-hourly live store into the weekly build would speed this up; that's a separate decision.
