-- One row per NUHS site, department and snapshot. Every figure here is NUHS's live ESTIMATE
-- at one moment, labelled measure_type = 'estimate'. It is not comparable one-for-one with MOH's
-- daily median of admitted patients (fct_ed_daily); see reconcile.nuhs_vs_moh_nuh.
-- as_of is NUHS's own "Last updated at" time where the page states one ('source_updated'),
-- otherwise when we fetched the page ('fetched').
-- is_adult_ed: NUHS lists Adult and Children's Emergency separately and NUH appears in both, while
-- MOH's NUH figures are adults only. Filter on it for one reading per hospital that matches what
-- MOH covers. NULL if the section name says neither (never guessed). The same rule ('adult' in the
-- department name) selects NUH for the reconcile.nuhs_vs_moh_nuh check.
CREATE OR REPLACE TABLE marts.fct_live_ed_snapshot AS
SELECT
    CASE
        WHEN s.site_name ILIKE '%national university hospital%' THEN 'NUH'
        WHEN s.site_name ILIKE '%ng teng fong%'                 THEN 'NTFGH'
        WHEN s.site_name ILIKE '%alexandra%'                    THEN 'AH'
    END                                                        AS hospital_code,   -- NULL if unrecognised
    s.site_name,
    s.department,
    CASE
        WHEN s.department ILIKE '%adult%' THEN TRUE
        WHEN s.department ILIKE '%child%' THEN FALSE
    END                                                        AS is_adult_ed,
    'estimate'                                                 AS measure_type,
    s.patients_waiting,
    s.est_wait_to_see_doctor_hours,
    s.est_bed_wait_hours,
    s.snapshot_at,
    s.source_updated_at,
    s.source_url,
    s.source_sha256,
    s.fetched_at,
    COALESCE(s.source_updated_at, s.fetched_at)                AS as_of,
    CASE WHEN s.source_updated_at IS NOT NULL THEN 'source_updated' ELSE 'fetched' END AS as_of_basis
FROM staging.stg_nuhs_live s
ORDER BY s.snapshot_at, s.site_name, s.department;
