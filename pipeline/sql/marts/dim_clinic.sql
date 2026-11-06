-- One row per CHAS clinic ever seen. is_active = in the latest snapshot.
-- as_of is when data.gov.sg says the CHAS dataset was last updated (as_of_basis
-- 'source_updated'), not when we downloaded it: the two can be years apart. If the dataset's
-- metadata is unavailable, as_of falls back to the fetch time ('fetched').
-- The metadata row is matched by dataset id inside the clinic row's own source_url, so a
-- clinic is never dated by a different dataset's metadata.
-- planning_area: the URA Master Plan 2025 area containing the clinic's point (main.clinic_planning_area,
-- computed by the transform runner). NULL with assignment 'outside_all' or 'ambiguous' if the
-- point is in no area or several: never snapped to the nearest one.
-- No on_has column: the Health Appointment System clinic list was unpublished on data.gov.sg.
-- clinic_name and address are tidied for display only: trimmed, runs of whitespace collapsed to one
-- space (CHAS publishes e.g. 'BUKIT TIMAH NAM SANG  CLINIC'). Wording and case are untouched, and
-- staging.stg_chas_clinics keeps the text exactly as published.
CREATE OR REPLACE TABLE marts.dim_clinic AS
SELECT
    c.clinic_key,
    c.hci_code,
    regexp_replace(trim(c.clinic_name), '\s+', ' ', 'g')    AS clinic_name,
    regexp_replace(trim(c.address), '\s+', ' ', 'g')        AS address,
    c.postal_code,
    c.latitude,
    c.longitude,
    c.programmes,
    c.has_cdmp,
    c.is_active,
    a.planning_area_code,
    a.planning_area_name                                       AS planning_area,
    a.assignment                                               AS planning_area_assignment,
    c.source_url,
    c.source_sha256,
    c.fetched_at,
    COALESCE(m.source_last_updated_at, c.fetched_at)                                 AS as_of,
    CASE WHEN m.source_last_updated_at IS NOT NULL THEN 'source_updated' ELSE 'fetched' END AS as_of_basis
FROM staging.stg_chas_clinics c
LEFT JOIN staging.stg_datagov_metadata m
       ON m.raw_source = 'datagov_chas' AND contains(c.source_url, m.dataset_id)
LEFT JOIN main.clinic_planning_area a ON a.clinic_key = c.clinic_key
ORDER BY c.clinic_key;
