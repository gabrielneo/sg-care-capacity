-- One row per entry in the polyclinic list (HPB screening-centre proxy). Typed and renamed only.
CREATE OR REPLACE VIEW staging.stg_polyclinics AS
SELECT
    CAST(facility_name AS VARCHAR)       AS facility_name,
    CAST(address AS VARCHAR)             AS address,
    CAST(postal_code AS VARCHAR)         AS postal_code,
    CAST(latitude AS DOUBLE)             AS latitude,
    CAST(longitude AS DOUBLE)            AS longitude,
    CAST(is_polyclinic AS BOOLEAN)       AS is_polyclinic,
    CAST(source_url AS VARCHAR)          AS source_url,
    CAST(source_sha256 AS VARCHAR)       AS source_sha256,
    CAST(ingested_at AS TIMESTAMP)       AS fetched_at
FROM main.polyclinics;
