-- One row per data.gov.sg dataset: its publisher and when the publisher last updated it.
-- Typed and renamed only.
CREATE OR REPLACE VIEW staging.stg_datagov_metadata AS
SELECT
    CAST(dataset_id AS VARCHAR)          AS dataset_id,
    CAST(source AS VARCHAR)              AS raw_source,
    CAST(dataset_name AS VARCHAR)        AS dataset_name,
    CAST(managed_by AS VARCHAR)          AS managed_by,
    CAST(last_updated_at AS TIMESTAMP)   AS source_last_updated_at,
    CAST(source_url AS VARCHAR)          AS source_url,
    CAST(source_sha256 AS VARCHAR)       AS source_sha256,
    CAST(ingested_at AS TIMESTAMP)       AS fetched_at
FROM main.source_metadata;
