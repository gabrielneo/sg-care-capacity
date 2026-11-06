-- One row per planning area: residents aged 65+ (latest SingStat year) against the active CHAS
-- clinics located in the area (placed by point-in-polygon on URA Master Plan 2025 boundaries).
-- Clinic counts are true counts from the full CHAS list: an area with none has 0. Ratios are NULL
-- where nobody aged 65+ lives (no denominator), never 0 or infinity.
-- Every planning area is kept even if its population is missing (missing means missing: population
-- and ratios are NULL). Missing population is a data-quality failure, not a transform error: the
-- blocking check completeness.population_present stops publishing until it is back.
-- Mixed vintages: clinics as of the CHAS update (June 2024), residents as of end-June of the
-- population year. as_of is the OLDER of the two, so the page never overstates how current it is.
CREATE OR REPLACE TABLE marts.fct_clinic_access AS
WITH latest_pop AS (
    SELECT * FROM marts.fct_planning_area_population
    WHERE year = (SELECT max(year) FROM marts.fct_planning_area_population)
),
clinics AS (
    SELECT planning_area_code,
           count(*) FILTER (WHERE is_active)                 AS active_chas_clinics,
           count(*) FILTER (WHERE is_active AND has_cdmp)    AS active_cdmp_clinics
    FROM marts.dim_clinic
    WHERE planning_area_code IS NOT NULL
    GROUP BY 1
),
clinic_vintage AS (
    SELECT max(as_of) AS clinics_as_of, any_value(as_of_basis) AS clinics_as_of_basis,
           array_to_string(list_sort(list_distinct(list(source_sha256))), ',') AS clinic_source_sha256
    FROM marts.dim_clinic
)
SELECT
    b.planning_area_code,
    COALESCE(p.planning_area, b.planning_area_name)           AS planning_area,
    b.region_name,
    p.year                                                    AS population_year,
    p.residents_total,
    p.residents_65plus,
    COALESCE(c.active_chas_clinics, 0)                        AS active_chas_clinics,
    COALESCE(c.active_cdmp_clinics, 0)                        AS active_cdmp_clinics,
    CASE WHEN p.residents_65plus > 0
         THEN 1000.0 * COALESCE(c.active_cdmp_clinics, 0) / p.residents_65plus END AS cdmp_clinics_per_1000_65plus,
    CASE WHEN p.residents_65plus > 0
         THEN 1000.0 * COALESCE(c.active_chas_clinics, 0) / p.residents_65plus END AS chas_clinics_per_1000_65plus,
    v.clinics_as_of,
    p.as_of                                                   AS population_as_of,
    v.clinic_source_sha256,
    p.source_sha256                                           AS population_source_sha256,
    b.source_sha256                                           AS boundary_source_sha256,
    least(v.clinics_as_of, p.as_of)                           AS as_of,         -- least() skips a NULL
    CASE WHEN p.as_of IS NULL OR v.clinics_as_of <= p.as_of THEN v.clinics_as_of_basis
         ELSE p.as_of_basis END                               AS as_of_basis
FROM staging.stg_planning_area_boundaries b
LEFT JOIN latest_pop p ON upper(p.planning_area) = upper(b.planning_area_name)
LEFT JOIN clinics c ON c.planning_area_code = b.planning_area_code
CROSS JOIN clinic_vintage v
ORDER BY p.planning_area;
