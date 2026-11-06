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
    f.dq_flags,
    j.wait_source_url,
    j.wait_source_sha256,
    j.attendance_source_url,
    j.attendance_source_sha256,
    greatest(j.wait_fetched_at, j.attendance_fetched_at)     AS as_of,
    'fetched'                                                AS as_of_basis
FROM joined j
LEFT JOIN flags f ON f.hospital_name = j.hospital_name AND f.report_date = j.report_date
WINDOW iso_wk AS (PARTITION BY j.hospital_code, isoyear(j.report_date), week(j.report_date))
ORDER BY j.hospital_code, j.report_date;
