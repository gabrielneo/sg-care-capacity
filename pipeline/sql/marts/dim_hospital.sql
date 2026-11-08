-- One row per MOH-reported site. Built from main.ref_hospital, which the runner seeds from
-- sg_health.config (HOSPITAL_REFERENCE, HOSPITAL_CLUSTER, HOSPITAL_COVERAGE_NOTE, HOSPITAL_LOCATION).
-- The location columns are a map pin from SLA OneMap, checked on location_checked.
CREATE OR REPLACE TABLE marts.dim_hospital AS
SELECT
    hospital_code,
    hospital_name,
    cluster,
    facility_type,
    CAST(reported_from AS DATE)      AS reported_from,
    coverage_note,
    exclusions_note,
    postal_code,
    latitude,
    longitude,
    location_source_url,
    CAST(location_checked AS DATE)   AS location_checked,
    source_url,
    source_sha256,
    CAST(as_of AS DATE)              AS as_of,
    'reference_checked'              AS as_of_basis
FROM main.ref_hospital
ORDER BY hospital_code;
