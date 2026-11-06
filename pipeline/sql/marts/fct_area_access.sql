-- One row per URA Master Plan 2025 planning area (55): seniors, clinics and access measures.
-- Replaces fct_clinic_access. Geometry-derived values (land area, % within 1 km of a CDMP clinic,
-- centroid distance to the nearest polyclinic) come from main.area_geo_metrics, computed in
-- SVY21 metres by sg_health/geo.py. Names come from main.ref_area_name_map (explicit, checked).
-- Every area is kept: missing population leaves population and ratios NULL (never 0), and the
-- blocking check completeness.population_present stops publishing.
CREATE OR REPLACE TABLE marts.fct_area_access AS
WITH latest_pop AS (
    SELECT * FROM marts.fct_planning_area_population
    WHERE year = (SELECT max(year) FROM marts.fct_planning_area_population)
),
clinics AS (
    SELECT planning_area_code,
           count(*) FILTER (WHERE is_active)                 AS chas_clinics,
           count(*) FILTER (WHERE is_active AND has_cdmp)    AS cdmp_clinics
    FROM marts.dim_clinic WHERE planning_area_code IS NOT NULL GROUP BY 1
),
clinic_vintage AS (
    SELECT max(as_of) AS clinics_as_of, any_value(as_of_basis) AS clinics_as_of_basis,
           array_to_string(list_sort(list_distinct(list(source_sha256))), ',') AS clinic_source_sha256
    FROM marts.dim_clinic
),
base AS (
    SELECT
        b.planning_area_code,
        coalesce(m.population_name, b.planning_area_name)     AS planning_area,
        b.region_name,
        p.year                                                AS population_year,
        p.residents_total,
        p.residents_65plus,
        coalesce(c.chas_clinics, 0)                           AS chas_clinics,
        coalesce(c.cdmp_clinics, 0)                           AS cdmp_clinics,
        g.area_km2,
        g.pct_area_within_1km_of_cdmp,
        g.approx_km_centroid_to_nearest_polyclinic,
        g.nearest_polyclinic,
        g.centroid_in_area,
        v.clinics_as_of, p.as_of AS population_as_of, v.clinics_as_of_basis, p.as_of_basis AS pop_basis,
        v.clinic_source_sha256, p.source_sha256 AS population_source_sha256,
        b.source_sha256 AS boundary_source_sha256, g.polyclinic_source_sha256
    FROM staging.stg_planning_area_boundaries b
    JOIN main.ref_area_name_map m ON m.planning_area_code = b.planning_area_code
    LEFT JOIN latest_pop p ON p.planning_area = m.population_name
    LEFT JOIN clinics c ON c.planning_area_code = b.planning_area_code
    LEFT JOIN main.area_geo_metrics g ON g.planning_area_code = b.planning_area_code
    CROSS JOIN clinic_vintage v
)
SELECT
    planning_area_code,
    planning_area,
    region_name,
    population_year,
    residents_total,
    residents_65plus,
    chas_clinics,
    cdmp_clinics,
    CASE WHEN residents_65plus > 0 THEN 1000.0 * chas_clinics / residents_65plus END  AS clinics_per_1k_seniors,
    CASE WHEN residents_65plus > 0 THEN 1000.0 * cdmp_clinics / residents_65plus END  AS cdmp_clinics_per_1k_seniors,
    area_km2,
    pct_area_within_1km_of_cdmp,
    approx_km_centroid_to_nearest_polyclinic,
    nearest_polyclinic,
    centroid_in_area,
    -- Area-specific caveats for the map tooltip; NULL when there is nothing particular to say.
    nullif(concat_ws('; ',
        CASE WHEN residents_total IS NULL THEN 'Population not loaded: ratios unavailable' END,
        CASE WHEN residents_total = 0 THEN 'No residents: ratios not applicable' END,
        CASE WHEN residents_total > 0 AND residents_65plus = 0 THEN 'No residents aged 65+: ratios not applicable' END,
        CASE WHEN residents_65plus > 0 AND residents_65plus < 1000
             THEN 'Fewer than 1,000 residents aged 65+: ratios are unstable and rounding (to 10) matters' END,
        CASE WHEN residents_65plus > 0 AND cdmp_clinics = 0
             THEN 'No CDMP clinic inside the area; residents may use clinics nearby (see % within 1 km)' END,
        CASE WHEN NOT centroid_in_area
             THEN 'Area centre lies outside its own boundary: polyclinic distance is very approximate' END
    ), '')                                                                            AS dq_note,
    clinics_as_of,
    population_as_of,
    clinic_source_sha256,
    population_source_sha256,
    boundary_source_sha256,
    polyclinic_source_sha256,
    least(clinics_as_of, population_as_of)                                            AS as_of,
    CASE WHEN population_as_of IS NULL OR clinics_as_of <= population_as_of THEN clinics_as_of_basis
         ELSE pop_basis END                                                           AS as_of_basis
FROM base
ORDER BY planning_area;
