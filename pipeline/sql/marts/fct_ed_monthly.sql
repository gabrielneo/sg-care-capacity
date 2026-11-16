-- One row per hospital per calendar month that has at least one reported day.
-- mean_of_daily_median_wait_hours is the MEAN OF THE DAILY MEDIANS reported that month. It is NOT a monthly
-- median wait: MOH publishes daily medians only. A partial month is kept, with its day counts and
-- is_complete_month = FALSE, never filled in. Year-on-year and month-on-month changes are computed only between
-- two complete months, and are NULL otherwise (never 0, never a guess).
CREATE OR REPLACE TABLE marts.fct_ed_monthly AS
WITH m AS (
    SELECT
        hospital_code,
        any_value(hospital_name)                                       AS hospital_name,
        CAST(date_trunc('month', report_date) AS DATE)                 AS month_start,
        avg(median_wait_hours)                                         AS mean_wait,
        CAST(sum(attendances) AS BIGINT)                               AS total_att,
        CAST(count(median_wait_hours) AS INTEGER)                      AS days_w,
        CAST(count(attendances) AS INTEGER)                            AS days_a,
        array_to_string(list_sort(list_distinct(list_filter(
            flatten([list(wait_source_sha256), list(attendance_source_sha256)]), lambda x: x IS NOT NULL))), ',')
                                                                       AS source_sha256,
        max(as_of)                                                     AS as_of
    FROM marts.fct_ed_daily
    GROUP BY hospital_code, CAST(date_trunc('month', report_date) AS DATE)
),
c AS (
    SELECT *, CAST(day(last_day(month_start)) AS INTEGER) AS dim,
           (days_w = day(last_day(month_start)) AND days_a = day(last_day(month_start))) AS complete
    FROM m
)
SELECT
    c.hospital_code,
    c.hospital_name,
    CAST(year(c.month_start) AS INTEGER)                               AS year,
    CAST(month(c.month_start) AS INTEGER)                              AS month,
    c.month_start,
    c.mean_wait                                                        AS mean_of_daily_median_wait_hours,
    c.total_att                                                        AS total_attendances,
    c.days_w                                                           AS days_reported_wait,
    c.days_a                                                           AS days_reported_attendances,
    c.dim                                                              AS days_in_month,
    c.complete                                                         AS is_complete_month,
    CASE WHEN c.complete AND y.complete AND y.mean_wait > 0 THEN (c.mean_wait / y.mean_wait - 1) * 100 END
                                                                       AS wait_yoy_pct,
    CASE WHEN c.complete AND y.complete AND y.total_att > 0 THEN (c.total_att / y.total_att - 1) * 100 END
                                                                       AS attendances_yoy_pct,
    CASE WHEN c.complete AND p.complete AND p.mean_wait > 0 THEN (c.mean_wait / p.mean_wait - 1) * 100 END
                                                                       AS wait_mom_pct,
    CASE WHEN c.complete AND p.complete AND p.total_att > 0 THEN (c.total_att / p.total_att - 1) * 100 END
                                                                       AS attendances_mom_pct,
    c.source_sha256,
    c.as_of,
    'fetched'                                                          AS as_of_basis
FROM c
LEFT JOIN c y ON y.hospital_code = c.hospital_code AND y.month_start = CAST(c.month_start - INTERVAL 1 YEAR AS DATE)
LEFT JOIN c p ON p.hospital_code = c.hospital_code AND p.month_start = CAST(c.month_start - INTERVAL 1 MONTH AS DATE)
ORDER BY c.hospital_code, c.month_start;
