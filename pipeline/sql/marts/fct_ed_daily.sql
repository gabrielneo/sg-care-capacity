-- One row per hospital per day. Bed waits and attendances come from separate MOH files, so they
-- are FULL OUTER joined: a day with only one metric is kept and the other is NULL (never 0).
-- Each metric keeps its own lineage.
CREATE OR REPLACE TABLE marts.fct_ed_daily AS
WITH joined AS (
    SELECT
        COALESCE(w.hospital_code, a.hospital_code)   AS hospital_code,
        COALESCE(w.hospital_name, a.hospital_name)   AS hospital_name,
        COALESCE(w.report_date, a.report_date)       AS report_date,
        w.median_wait_hours,
        a.attendances,
        w.source_url     AS wait_source_url,
        w.source_sha256  AS wait_source_sha256,
        w.fetched_at     AS wait_fetched_at,
        a.source_url     AS attendance_source_url,
        a.source_sha256  AS attendance_source_sha256,
        a.fetched_at     AS attendance_fetched_at
    FROM staging.stg_moh_bed_waits w
    FULL OUTER JOIN staging.stg_moh_ed_attendances a
      ON a.hospital_code = w.hospital_code AND a.report_date = w.report_date
),
-- WARN findings from the load gate for these rows (the rows are published, the flags shown).
flags AS (
    SELECT
        json_extract_string(row_key, '$.hospital_name')                       AS hospital_name,
        CAST(left(json_extract_string(row_key, '$.report_date'), 10) AS DATE) AS report_date,
        string_agg(DISTINCT check_id, ',' ORDER BY check_id)                  AS dq_flags
    FROM main.dq_findings
    WHERE severity = 'WARN' AND scope = 'row' AND table_name IN ('moh_bed_waits', 'moh_ed_attendances')
    GROUP BY 1, 2
),
-- Days in a week whose median bed wait is 10x above or below the hospital's trailing 4-week median: the same rule as
-- the dataset check unit.weekly_shift_10x (Sunday-to-Saturday weeks, trailing 4 weeks; sg_health/quality/validate.py,
-- SHIFT_RATIO and SHIFT_TRAILING_WEEKS, pinned by a test). A level shift is flagged on its days, so a chart can mark it.
weekly AS (
    SELECT hospital_code,
           CAST(date_trunc('week', report_date + INTERVAL 1 DAY) AS DATE) - 1 AS wk,
           median(median_wait_hours)                                         AS med
    FROM joined WHERE median_wait_hours IS NOT NULL GROUP BY 1, 2
),
shifted AS (
    SELECT hospital_code, wk FROM (
        SELECT hospital_code, wk, med,
               median(med) OVER trail AS prior_med, count(med) OVER trail AS n
        FROM weekly
        WINDOW trail AS (PARTITION BY hospital_code ORDER BY wk ROWS BETWEEN 4 PRECEDING AND 1 PRECEDING)
    ) WHERE n = 4 AND (med > 10 * prior_med OR med < prior_med / 10)
)
SELECT
    j.hospital_code,
    j.hospital_name,
    j.report_date,
    CAST(isoyear(j.report_date) AS INTEGER)                  AS iso_year,
    CAST(week(j.report_date) AS INTEGER)                     AS iso_week,
    j.median_wait_hours,
    j.attendances,
    (count(j.median_wait_hours) OVER iso_wk = 7
     AND count(j.attendances) OVER iso_wk = 7)               AS is_complete_week,
    nullif(concat_ws(',', f.dq_flags, CASE WHEN sh.wk IS NOT NULL THEN 'unit.weekly_shift_10x' END), '') AS dq_flags,
    j.wait_source_url,
    j.wait_source_sha256,
    j.attendance_source_url,
    j.attendance_source_sha256,
    greatest(j.wait_fetched_at, j.attendance_fetched_at)     AS as_of,
    'fetched'                                                AS as_of_basis
FROM joined j
LEFT JOIN flags f ON f.hospital_name = j.hospital_name AND f.report_date = j.report_date
LEFT JOIN shifted sh ON sh.hospital_code = j.hospital_code
                    AND sh.wk = CAST(date_trunc('week', j.report_date + INTERVAL 1 DAY) AS DATE) - 1
WINDOW iso_wk AS (PARTITION BY j.hospital_code, isoyear(j.report_date), week(j.report_date))
ORDER BY j.hospital_code, j.report_date;
