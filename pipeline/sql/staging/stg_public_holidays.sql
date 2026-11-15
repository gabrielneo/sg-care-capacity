-- One row per public-holiday date and name, as published. Typed and renamed only.
CREATE OR REPLACE VIEW staging.stg_public_holidays AS
SELECT
    CAST(holiday_date AS DATE)           AS holiday_date,
    CAST(holiday_name AS VARCHAR)        AS holiday_name,
    CAST(source_url AS VARCHAR)          AS source_url,
    CAST(source_sha256 AS VARCHAR)       AS source_sha256,
    CAST(ingested_at AS TIMESTAMP)       AS fetched_at
FROM main.public_holidays;
