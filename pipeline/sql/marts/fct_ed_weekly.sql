-- One row per hospital per ISO week (Monday to Sunday).
-- mean_of_daily_median_wait_hours is the MEAN OF THE DAILY MEDIANS reported that week. It is
-- NOT a weekly median wait: MOH publishes daily medians only, and the median of a week's
-- patients cannot be derived from them. Partial weeks are not filled in; see days_reported_*.
CREATE OR REPLACE TABLE marts.fct_ed_weekly AS
SELECT
    hospital_code,
    any_value(hospital_name)                                       AS hospital_name,
    iso_year,
    iso_week,
    CAST(min(date_trunc('week', report_date)) AS DATE)             AS week_start,
    CAST(min(date_trunc('week', report_date)) AS DATE) + 6         AS week_end,
    avg(median_wait_hours)                                         AS mean_of_daily_median_wait_hours,
    CAST(sum(attendances) AS BIGINT)                               AS total_attendances,
    CAST(count(median_wait_hours) AS INTEGER)                      AS days_reported_wait,
    CAST(count(attendances) AS INTEGER)                            AS days_reported_attendances,
    (count(median_wait_hours) = 7 AND count(attendances) = 7)     AS is_complete_week,
    array_to_string(list_sort(list_distinct(list_filter(
        flatten([list(wait_source_sha256), list(attendance_source_sha256)]), lambda x: x IS NOT NULL))), ',')
                                                                   AS source_sha256,
    max(as_of)                                                     AS as_of,
    'fetched'                                                      AS as_of_basis
FROM marts.fct_ed_daily
GROUP BY hospital_code, iso_year, iso_week
ORDER BY hospital_code, iso_year, iso_week;
