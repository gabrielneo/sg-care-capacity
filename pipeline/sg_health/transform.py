"""Transformation layer: plain SQL files run in DuckDB, in a fixed order.

    pipeline/sql/staging/*.sql   views: one per clean table, typed and renamed, no business logic
    pipeline/sql/marts/*.sql     tables: what the API and site will read

Marts are built from the clean tables only, so quarantined rows never reach them. After the
SQL runs, every model's row counts are reconciled against its inputs and written to
`transform_log`. A row that disappears without an allowed, documented reason stops the
transform with TransformError: an incomplete mart is never left looking complete.

No dbt: eight models in a fixed order don't need a DAG engine, and plain files keep the
dependency list short. They can move into dbt unchanged if that ever pays off.
"""
from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import dataclass
from pathlib import Path

import pandas as pd

from . import config
from .warehouse import Warehouse

LOG = logging.getLogger(__name__)

SQL_DIR = Path(__file__).resolve().parents[1] / "sql"

# Run order. A model may only read models listed before it.
MODELS: list[tuple[str, str]] = [
    ("staging", "stg_moh_bed_waits"),
    ("staging", "stg_moh_ed_attendances"),
    ("staging", "stg_chas_clinics"),
    ("staging", "stg_nuhs_live"),
    ("staging", "stg_datagov_metadata"),
    ("marts", "dim_hospital"),
    ("marts", "fct_ed_daily"),
    ("marts", "fct_ed_weekly"),
    ("marts", "dim_clinic"),
    ("marts", "fct_live_ed_snapshot"),
]


@dataclass(frozen=True)
class Reconciliation:
    """rows_in (from an input) must equal rows_out (in the model) plus allowed drops."""
    model: str
    input: str
    rows_in_sql: str
    rows_out_sql: str
    allowed_drop_reason: str | None = None    # None: no row may be dropped


RECONCILIATIONS: list[Reconciliation] = [
    Reconciliation("staging.stg_moh_bed_waits", "main.moh_bed_waits",
                   "SELECT count(*) FROM main.moh_bed_waits", "SELECT count(*) FROM staging.stg_moh_bed_waits"),
    Reconciliation("staging.stg_moh_ed_attendances", "main.moh_ed_attendances",
                   "SELECT count(*) FROM main.moh_ed_attendances",
                   "SELECT count(*) FROM staging.stg_moh_ed_attendances"),
    Reconciliation("staging.stg_chas_clinics", "main.chas_clinics",
                   "SELECT count(*) FROM main.chas_clinics", "SELECT count(*) FROM staging.stg_chas_clinics"),
    Reconciliation("staging.stg_nuhs_live", "main.nuhs_live_waits",
                   "SELECT count(*) FROM main.nuhs_live_waits", "SELECT count(*) FROM staging.stg_nuhs_live"),
    Reconciliation("staging.stg_datagov_metadata", "main.source_metadata",
                   "SELECT count(*) FROM main.source_metadata", "SELECT count(*) FROM staging.stg_datagov_metadata"),
    # One clinic row per staged clinic: the metadata join must never duplicate or drop clinics.
    Reconciliation("marts.dim_clinic", "staging.stg_chas_clinics",
                   "SELECT count(*) FROM staging.stg_chas_clinics", "SELECT count(*) FROM marts.dim_clinic"),
    Reconciliation("marts.fct_live_ed_snapshot", "staging.stg_nuhs_live",
                   "SELECT count(*) FROM staging.stg_nuhs_live", "SELECT count(*) FROM marts.fct_live_ed_snapshot"),
    Reconciliation("marts.dim_hospital", "main.ref_hospital",
                   "SELECT count(*) FROM main.ref_hospital", "SELECT count(*) FROM marts.dim_hospital"),
    # Every staged value lands in exactly one daily row.
    Reconciliation("marts.fct_ed_daily", "staging.stg_moh_bed_waits",
                   "SELECT count(*) FROM staging.stg_moh_bed_waits",
                   "SELECT count(median_wait_hours) FROM marts.fct_ed_daily"),
    Reconciliation("marts.fct_ed_daily", "staging.stg_moh_ed_attendances",
                   "SELECT count(*) FROM staging.stg_moh_ed_attendances",
                   "SELECT count(attendances) FROM marts.fct_ed_daily"),
    # Every daily row belongs to a hospital in dim_hospital.
    Reconciliation("marts.fct_ed_daily", "marts.dim_hospital (referential)",
                   "SELECT count(*) FROM marts.fct_ed_daily",
                   "SELECT count(*) FROM marts.fct_ed_daily JOIN marts.dim_hospital USING (hospital_code)"),
    # Every daily value is counted in exactly one week.
    Reconciliation("marts.fct_ed_weekly", "marts.fct_ed_daily (wait days)",
                   "SELECT count(median_wait_hours) FROM marts.fct_ed_daily",
                   "SELECT sum(days_reported_wait) FROM marts.fct_ed_weekly"),
    Reconciliation("marts.fct_ed_weekly", "marts.fct_ed_daily (attendance days)",
                   "SELECT count(attendances) FROM marts.fct_ed_daily",
                   "SELECT sum(days_reported_attendances) FROM marts.fct_ed_weekly"),
]

# Rows withheld before staging, by the data-quality gate. Logged so the chain from raw file to
# mart accounts for every row; see docs/data_quality.md.
UPSTREAM_QUARANTINE = {
    "staging.stg_moh_bed_waits": "quarantine_moh_bed_waits",
    "staging.stg_moh_ed_attendances": "quarantine_moh_ed_attendances",
    "staging.stg_chas_clinics": "quarantine_chas_clinics",
    "staging.stg_nuhs_live": "quarantine_nuhs_live_waits",
    "staging.stg_datagov_metadata": "quarantine_source_metadata",
}


class TransformError(RuntimeError):
    """A model lost rows without an allowed reason, or a SQL file failed."""


def reference_hospitals() -> pd.DataFrame:
    """The hospital reference from config, as a table. Its sha256 is the lineage of dim_hospital."""
    rows = []
    for code, (facility_type, valid_from) in config.HOSPITAL_REFERENCE.items():
        rows.append({
            "hospital_code": code,
            "hospital_name": config.HOSPITALS[code][0],
            "cluster": config.HOSPITAL_CLUSTER[code],
            "facility_type": facility_type,
            "reported_from": valid_from,
            "coverage_note": config.HOSPITAL_COVERAGE_NOTE.get(code),
        })
    df = pd.DataFrame(rows)
    df["reported_from"] = pd.to_datetime(df["reported_from"]).dt.date
    digest = hashlib.sha256(json.dumps(rows, default=str, sort_keys=True).encode()).hexdigest()
    df["source_url"] = config.REFERENCE_SOURCE_URL
    df["source_sha256"] = digest
    df["as_of"] = pd.Timestamp(config.REFERENCE_CHECKED)
    df["exclusions_note"] = config.MOH_EXCLUSIONS_NOTE
    return df


def run_transform(wh: Warehouse) -> pd.DataFrame:
    """Build staging views and mart tables, reconcile row counts, write transform_log."""
    con = wh.con
    con.execute("CREATE SCHEMA IF NOT EXISTS staging")
    con.execute("CREATE SCHEMA IF NOT EXISTS marts")
    con.register("_ref_hospital", reference_hospitals())
    try:
        con.execute("CREATE OR REPLACE TABLE main.ref_hospital AS SELECT * FROM _ref_hospital ORDER BY hospital_code")
    finally:
        con.unregister("_ref_hospital")

    for layer, name in MODELS:
        path = SQL_DIR / layer / f"{name}.sql"
        try:
            con.execute(path.read_text())
        except Exception as exc:
            raise TransformError(f"{layer}.{name} ({path.name}) failed: {exc}") from exc

    log = reconcile(wh)
    con.register("_tlog", log)
    try:
        con.execute("CREATE OR REPLACE TABLE main.transform_log AS SELECT * FROM _tlog")
    finally:
        con.unregister("_tlog")
    unexplained = log[log["status"] == "unexplained"]
    for rec in log.to_dict("records"):
        reason = rec["reason"] if isinstance(rec["reason"], str) else None
        LOG.info("transform %s <- %s: in %d, out %d, dropped %d%s", rec["model"], rec["input"], rec["rows_in"],
                 rec["rows_out"], rec["rows_dropped"], f" ({reason})" if reason else "",
                 extra={"fields": {"event": "transform_reconcile", **rec, "reason": reason}})
    if len(unexplained):
        raise TransformError("rows lost without a logged reason: " + "; ".join(
            f"{r.model} <- {r.input}: {r.rows_dropped} rows" for r in unexplained.itertuples()))
    return log


def reconcile(wh: Warehouse) -> pd.DataFrame:
    rows = []
    one = lambda sql: int(wh.con.execute(sql).fetchall()[0][0] or 0)
    for rc in RECONCILIATIONS:
        rows_in, rows_out = one(rc.rows_in_sql), one(rc.rows_out_sql)
        dropped = rows_in - rows_out
        if dropped == 0:
            status, reason = "ok", None
        elif dropped > 0 and rc.allowed_drop_reason:
            status, reason = "explained", rc.allowed_drop_reason
        else:
            status, reason = "unexplained", ("more rows out than in" if dropped < 0 else None)
        rows.append({"model": rc.model, "input": rc.input, "rows_in": rows_in, "rows_out": rows_out,
                     "rows_dropped": dropped, "status": status, "reason": reason})
    for model, qtable in UPSTREAM_QUARANTINE.items():
        n = one(f"SELECT count(*) FROM main.{qtable}")
        rows.append({"model": model, "input": f"main.{qtable}", "rows_in": n, "rows_out": 0, "rows_dropped": n,
                     "status": "explained" if n else "ok",
                     "reason": "withheld by the data-quality gate before staging (see dq_findings)" if n else None})
    return pd.DataFrame(rows, columns=["model", "input", "rows_in", "rows_out", "rows_dropped", "status", "reason"])
