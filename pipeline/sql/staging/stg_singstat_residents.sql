-- One row per planning area and year: SingStat resident counts, summed from the published cells.
-- Typed and renamed only. Reads the clean table, so quarantined rows never appear here.
CREATE OR REPLACE VIEW staging.stg_singstat_residents AS
SELECT
    CAST(planning_area AS VARCHAR)       AS planning_area,
    CAST(year AS INTEGER)                AS year,
    CAST(residents_total AS BIGINT)      AS residents_total,
    CAST(residents_65plus AS BIGINT)     AS residents_65plus,
    CAST(source_table AS VARCHAR)        AS source_table,
    CAST(source_url AS VARCHAR)          AS source_url,
    CAST(source_sha256 AS VARCHAR)       AS source_sha256,
    CAST(ingested_at AS TIMESTAMP)       AS fetched_at
FROM main.pop_65plus_by_area;
