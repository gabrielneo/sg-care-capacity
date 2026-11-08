-- One row per polyclinic, from the HPB screening-centre list (the polyclinic proxy: see
-- sg_health/config.py, DATAGOV_DATASETS["polyclinics"]). Entries not named "... Polyclinic"
-- are left out. as_of is when data.gov.sg last updated that dataset ('source_updated'), or the
-- fetch time if its metadata is unavailable ('fetched'), as for dim_clinic.
CREATE OR REPLACE TABLE marts.dim_polyclinic AS
SELECT
    p.facility_name                                                                  AS polyclinic_name,
    regexp_replace(trim(p.address), '\s+', ' ', 'g')                                AS address,
    p.postal_code,
    p.latitude,
    p.longitude,
    p.source_url,
    p.source_sha256,
    p.fetched_at,
    COALESCE(m.source_last_updated_at, p.fetched_at)                                 AS as_of,
    CASE WHEN m.source_last_updated_at IS NOT NULL THEN 'source_updated' ELSE 'fetched' END AS as_of_basis
FROM staging.stg_polyclinics p
LEFT JOIN staging.stg_datagov_metadata m
       ON m.raw_source = 'datagov_polyclinics' AND contains(p.source_url, m.dataset_id)
WHERE p.is_polyclinic
ORDER BY p.facility_name;
