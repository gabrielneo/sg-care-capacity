-- One row per hospital per day: MOH daily attendances at the emergency department.
-- Typed and renamed only. Reads the clean table, so quarantined rows never appear here.
CREATE OR REPLACE VIEW staging.stg_moh_ed_attendances AS
SELECT
    CAST(hospital_code AS VARCHAR)       AS hospital_code,
    CAST(hospital_name AS VARCHAR)       AS hospital_name,
    CAST(report_date AS DATE)            AS report_date,
    CAST(total_attendances AS BIGINT)    AS attendances,
    CAST(source_url AS VARCHAR)          AS source_url,
    CAST(source_sha256 AS VARCHAR)       AS source_sha256,
    CAST(ingested_at AS TIMESTAMP)       AS fetched_at
FROM main.moh_ed_attendances;
