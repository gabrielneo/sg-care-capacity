-- One row per CHAS clinic ever seen. is_active = in the latest snapshot.
-- as_of is when data.gov.sg says the CHAS dataset was last updated (as_of_basis
-- 'source_updated'), not when we downloaded it: the two can be years apart. If the dataset's
-- metadata is unavailable, as_of falls back to the fetch time ('fetched').
-- The metadata row is matched by dataset id inside the clinic row's own source_url, so a
-- clinic is never dated by a different dataset's metadata.
-- No on_has column: the Health Appointment System clinic list was unpublished on data.gov.sg.
CREATE OR REPLACE TABLE marts.dim_clinic AS
SELECT
    c.clinic_key,
    c.hci_code,
    c.clinic_name,
    c.address,
    c.postal_code,
    c.latitude,
    c.longitude,
    c.programmes,
    c.has_cdmp,
    c.is_active,
    c.source_url,
    c.source_sha256,
    c.fetched_at,
    COALESCE(m.source_last_updated_at, c.fetched_at)                                 AS as_of,
    CASE WHEN m.source_last_updated_at IS NOT NULL THEN 'source_updated' ELSE 'fetched' END AS as_of_basis
FROM staging.stg_chas_clinics c
LEFT JOIN staging.stg_datagov_metadata m
       ON m.raw_source = 'datagov_chas' AND contains(c.source_url, m.dataset_id)
ORDER BY c.clinic_key;
