-- One row per URA planning area (latest boundary file). Typed and renamed only.
CREATE OR REPLACE VIEW staging.stg_planning_area_boundaries AS
SELECT
    CAST(planning_area_code AS VARCHAR)  AS planning_area_code,
    CAST(planning_area_name AS VARCHAR)  AS planning_area_name,
    CAST(region_name AS VARCHAR)         AS region_name,
    CAST(geometry_wkt AS VARCHAR)        AS geometry_wkt,
    CAST(source_url AS VARCHAR)          AS source_url,
    CAST(source_sha256 AS VARCHAR)       AS source_sha256,
    CAST(ingested_at AS TIMESTAMP)       AS fetched_at
FROM main.planning_area_boundaries;
