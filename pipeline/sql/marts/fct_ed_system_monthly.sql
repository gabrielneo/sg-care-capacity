-- One row per calendar month: the average across the full emergency departments that MOH reported throughout
-- (dim_hospital.facility_type = 'ED' and no reported_from date: today 7 sites). Alexandra Hospital (an urgent care
-- centre) and Woodlands Hospital (reported from 23 Jun 2024) are left out, so the series compares like with like and
-- does not step when a site joins. A month counts only when every one of those hospitals has it complete; otherwise
-- the figures are NULL and n_complete_hospitals says how many were in. Year-on-year and month-on-month changes need
-- two such months.
CREATE OR REPLACE TABLE marts.fct_ed_system_monthly AS
WITH members AS (
    SELECT hospital_code FROM marts.dim_hospital WHERE facility_type = 'ED' AND reported_from IS NULL
),
agg AS (
    SELECT
        m.month_start,
        CAST(count(*) AS INTEGER)                                                 AS n_in_month,
        CAST(count(*) FILTER (WHERE m.is_complete_month) AS INTEGER)              AS n_complete_hospitals,
        avg(m.mean_of_daily_median_wait_hours)                                    AS wait,
        CAST(sum(m.total_attendances) AS BIGINT)                                  AS att,
        array_to_string(list_sort(list_distinct(flatten(list(string_split(m.source_sha256, ','))))), ',')
                                                                                  AS source_sha256,
        max(m.as_of)                                                              AS as_of
    FROM marts.fct_ed_monthly m JOIN members USING (hospital_code)
    GROUP BY m.month_start
),
c AS (
    SELECT a.*, (SELECT count(*) FROM members) AS n_hospitals,
           (a.n_complete_hospitals = (SELECT count(*) FROM members)) AS complete
    FROM agg a
)
SELECT
    CAST(year(c.month_start) AS INTEGER)                                          AS year,
    CAST(month(c.month_start) AS INTEGER)                                         AS month,
    c.month_start,
    CAST(c.n_hospitals AS INTEGER)                                                AS n_hospitals,
    c.n_complete_hospitals,
    c.complete                                                                    AS is_complete_month,
    CASE WHEN c.complete THEN c.wait END                                          AS mean_of_hospital_mean_wait_hours,
    CASE WHEN c.complete THEN c.att END                                           AS total_attendances,
    CASE WHEN c.complete AND y.complete AND y.wait > 0 THEN (c.wait / y.wait - 1) * 100 END       AS wait_yoy_pct,
    CASE WHEN c.complete AND y.complete AND y.att > 0 THEN (c.att / y.att - 1) * 100 END          AS attendances_yoy_pct,
    CASE WHEN c.complete AND p.complete AND p.wait > 0 THEN (c.wait / p.wait - 1) * 100 END       AS wait_mom_pct,
    CASE WHEN c.complete AND p.complete AND p.att > 0 THEN (c.att / p.att - 1) * 100 END          AS attendances_mom_pct,
    c.source_sha256,
    c.as_of,
    'fetched'                                                                     AS as_of_basis
FROM c
LEFT JOIN c y ON y.month_start = CAST(c.month_start - INTERVAL 1 YEAR AS DATE)
LEFT JOIN c p ON p.month_start = CAST(c.month_start - INTERVAL 1 MONTH AS DATE)
ORDER BY c.month_start;
