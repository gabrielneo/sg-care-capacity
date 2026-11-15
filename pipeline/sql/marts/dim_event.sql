-- Dated events that chart annotations mark, one row each. Two kinds, never mixed up:
--   holiday        a Singapore public holiday, as published (including "(Observed)" days)
--   source_change  a hospital starts to appear in MOH's figures part-way through the series (dim_hospital.reported_from)
-- Totals across hospitals step when a source_change happens, so a chart marks it. Nothing is invented: every row is
-- a published holiday or a hospital's recorded first reporting date.
CREATE OR REPLACE TABLE marts.dim_event AS
SELECT
    h.holiday_date                                                                    AS event_date,
    h.holiday_name                                                                    AS label,
    'holiday'                                                                         AS kind,
    h.source_url,
    h.source_sha256,
    COALESCE(m.source_last_updated_at, h.fetched_at)                                  AS as_of,
    CASE WHEN m.source_last_updated_at IS NOT NULL THEN 'source_updated' ELSE 'fetched' END AS as_of_basis
FROM staging.stg_public_holidays h
LEFT JOIN staging.stg_datagov_metadata m
       ON m.raw_source = 'datagov_public_holidays' AND contains(h.source_url, m.dataset_id)
UNION ALL
SELECT
    d.reported_from                                                                   AS event_date,
    COALESCE(d.short_name, d.hospital_name) || ' starts in MOH''s figures'            AS label,
    'source_change'                                                                   AS kind,
    d.source_url,
    d.source_sha256,
    CAST(d.as_of AS TIMESTAMP)                                                        AS as_of,
    d.as_of_basis
FROM marts.dim_hospital d
WHERE d.reported_from IS NOT NULL
ORDER BY event_date, kind, label;
