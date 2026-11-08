-- One row per NUHS site, department and snapshot: the live wait-time page as published.
-- Typed and renamed only. Reads the clean table, so quarantined rows never appear here.
CREATE OR REPLACE VIEW staging.stg_nuhs_live AS
SELECT
    CAST(site_name AS VARCHAR)               AS site_name,
    CAST(department AS VARCHAR)              AS department,
    CAST(patients_waiting AS INTEGER)        AS patients_waiting,
    CAST(est_consult_wait_hours AS DOUBLE)   AS est_wait_to_see_doctor_hours,
    CAST(est_bed_wait_hours AS DOUBLE)       AS est_bed_wait_hours,
    -- '<' or '>' when NUHS published a bound ("< 1 hour(s)"): the hours column is then the bound.
    CAST(est_consult_wait_qualifier AS VARCHAR) AS est_wait_to_see_doctor_qualifier,
    CAST(est_bed_wait_qualifier AS VARCHAR)  AS est_bed_wait_qualifier,
    CAST(source_updated_at AS TIMESTAMP)     AS source_updated_at,
    CAST(snapshot_timestamp AS TIMESTAMP)    AS snapshot_at,
    CAST(source_url AS VARCHAR)              AS source_url,
    CAST(source_sha256 AS VARCHAR)           AS source_sha256,
    CAST(ingested_at AS TIMESTAMP)           AS fetched_at
FROM main.nuhs_live_waits;
