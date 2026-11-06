-- One row per planning area and year: residents, residents aged 65+, and their share.
-- as_of is the reference date SingStat counts residents at (end of June of `year`),
-- as_of_basis 'reference_period'. share_65plus is NULL, not 0, where there are no residents
-- (e.g. Tuas, the water catchments): there is no share to report.
CREATE OR REPLACE TABLE marts.fct_planning_area_population AS
SELECT
    planning_area,
    year,
    residents_total,
    residents_65plus,
    CASE WHEN residents_total > 0 THEN CAST(residents_65plus AS DOUBLE) / residents_total END AS share_65plus,
    make_date(year, 6, 30)                                   AS reference_date,
    source_table,
    source_url,
    source_sha256,
    fetched_at,
    CAST(make_date(year, 6, 30) AS TIMESTAMP)                AS as_of,
    'reference_period'                                       AS as_of_basis
FROM staging.stg_singstat_residents
ORDER BY year, planning_area;
