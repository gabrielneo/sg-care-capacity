-- One row per CHAS clinic ever seen (inactive = missing from the latest snapshot).
-- Typed and renamed only. Reads the clean table, so quarantined rows never appear here.
CREATE OR REPLACE VIEW staging.stg_chas_clinics AS
SELECT
    CAST(clinic_key AS VARCHAR)          AS clinic_key,
    CAST(hci_code AS VARCHAR)            AS hci_code,
    CAST(clinic_name AS VARCHAR)         AS clinic_name,
    CAST(address AS VARCHAR)             AS address,
    CAST(postal_code AS VARCHAR)         AS postal_code,
    CAST(latitude AS DOUBLE)             AS latitude,
    CAST(longitude AS DOUBLE)            AS longitude,
    CAST(programmes AS VARCHAR)          AS programmes,
    CAST(has_cdmp AS BOOLEAN)            AS has_cdmp,
    CAST(is_active AS BOOLEAN)           AS is_active,
    CAST(source_url AS VARCHAR)          AS source_url,
    CAST(source_sha256 AS VARCHAR)       AS source_sha256,
    CAST(ingested_at AS TIMESTAMP)       AS fetched_at
FROM main.chas_clinics;
