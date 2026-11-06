-- One row per published metric: what it is, its unit, whether the publisher states that unit or
-- we inferred it, and the caveat to show with it. Seeded from sg_health/metrics.py.
CREATE OR REPLACE TABLE marts.dim_metric AS
SELECT metric_id, label, definition, unit, unit_basis, caveat, source_name,
       source_sha256, CAST(as_of AS DATE) AS as_of, 'reference_checked' AS as_of_basis
FROM main.ref_metric
ORDER BY metric_id;
