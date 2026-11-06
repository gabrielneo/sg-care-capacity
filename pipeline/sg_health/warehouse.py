"""DuckDB warehouse: schema, idempotent upserts and the raw_manifest mirror."""
from __future__ import annotations

from dataclasses import asdict, fields
from pathlib import Path
from typing import Iterable

import pandas as pd

from .raw import RawRecord, link_url

DDL = [
    """CREATE TABLE IF NOT EXISTS moh_bed_waits (
        hospital_name VARCHAR NOT NULL, report_date DATE NOT NULL,
        median_wait_hours DOUBLE, hospital_code VARCHAR,
        source_url VARCHAR NOT NULL, source_sha256 VARCHAR NOT NULL, ingested_at TIMESTAMP NOT NULL,
        PRIMARY KEY (hospital_name, report_date))""",
    """CREATE TABLE IF NOT EXISTS moh_ed_attendances (
        hospital_name VARCHAR NOT NULL, report_date DATE NOT NULL,
        total_attendances BIGINT, hospital_code VARCHAR,
        source_url VARCHAR NOT NULL, source_sha256 VARCHAR NOT NULL, ingested_at TIMESTAMP NOT NULL,
        PRIMARY KEY (hospital_name, report_date))""",
    """CREATE TABLE IF NOT EXISTS chas_clinics (
        clinic_key VARCHAR PRIMARY KEY, clinic_name VARCHAR, address VARCHAR,
        postal_code VARCHAR, latitude DOUBLE, longitude DOUBLE, has_cdmp BOOLEAN,
        hci_code VARCHAR, programmes VARCHAR, is_active BOOLEAN,
        source_url VARCHAR NOT NULL, source_sha256 VARCHAR NOT NULL, ingested_at TIMESTAMP NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS nuhs_live_waits (
        site_name VARCHAR NOT NULL, department VARCHAR NOT NULL, patients_waiting INTEGER, est_bed_wait_hours DOUBLE,
        est_consult_wait_hours DOUBLE, source_updated_at TIMESTAMP,
        snapshot_timestamp TIMESTAMP NOT NULL, source_url VARCHAR NOT NULL, source_sha256 VARCHAR NOT NULL, ingested_at TIMESTAMP NOT NULL,
        PRIMARY KEY (site_name, department, snapshot_timestamp))""",
    # SingStat residents per planning area and year (all residents, and those aged 65+).
    """CREATE TABLE IF NOT EXISTS pop_65plus_by_area (
        planning_area VARCHAR NOT NULL, year INTEGER NOT NULL, residents_total BIGINT,
        residents_65plus BIGINT, source_table VARCHAR,
        source_url VARCHAR NOT NULL, source_sha256 VARCHAR NOT NULL, ingested_at TIMESTAMP NOT NULL,
        PRIMARY KEY (planning_area, year))""",
    # Annual A&E attendances (all public-sector A&E departments). Reconciliation only.
    """CREATE TABLE IF NOT EXISTS annual_ae_attendances (
        year INTEGER NOT NULL, attendances BIGINT, series VARCHAR NOT NULL,
        source_url VARCHAR NOT NULL, source_sha256 VARCHAR NOT NULL, ingested_at TIMESTAMP NOT NULL,
        PRIMARY KEY (year))""",
    # data.gov.sg dataset metadata. last_updated_at is the upstream "as of" for that dataset.
    """CREATE TABLE IF NOT EXISTS source_metadata (
        dataset_id VARCHAR NOT NULL, source VARCHAR NOT NULL, dataset_name VARCHAR, managed_by VARCHAR,
        last_updated_at TIMESTAMP,
        source_url VARCHAR NOT NULL, source_sha256 VARCHAR NOT NULL, ingested_at TIMESTAMP NOT NULL,
        PRIMARY KEY (dataset_id))""",
    # One row per fetch, mirrored from data/raw/manifest.jsonl (the source of truth).
    """CREATE TABLE IF NOT EXISTS raw_manifest (
        seq INTEGER PRIMARY KEY, source VARCHAR NOT NULL, url VARCHAR NOT NULL,
        sha256 VARCHAR NOT NULL, bytes BIGINT NOT NULL, http_status INTEGER,
        content_type VARCHAR, fetched_at TIMESTAMP NOT NULL, path VARCHAR NOT NULL)""",
    # Data quality (see docs/data_quality.md). dq_findings holds the current findings of the
    # load gate (rebuilt by reparse); dq_results is the append-only log of `validate` runs.
    """CREATE TABLE IF NOT EXISTS dq_findings (
        table_name VARCHAR NOT NULL, check_id VARCHAR NOT NULL, severity VARCHAR NOT NULL,
        scope VARCHAR NOT NULL, row_key VARCHAR, failing_rows INTEGER NOT NULL, detail VARCHAR,
        source_url VARCHAR NOT NULL, source_sha256 VARCHAR NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS dq_results (
        check_id VARCHAR NOT NULL, "table" VARCHAR NOT NULL, severity VARCHAR NOT NULL,
        status VARCHAR NOT NULL, failing_rows INTEGER NOT NULL, details VARCHAR,
        run_id VARCHAR NOT NULL, checked_at TIMESTAMP NOT NULL, scope VARCHAR NOT NULL,
        blocks_publish BOOLEAN NOT NULL, PRIMARY KEY (run_id, check_id, "table"))""",
]

# Lineage columns carried by every parsed row (see docs/data_dictionary.md).
LINEAGE_COLUMNS = ("source_url", "source_sha256", "ingested_at")

# Tables rebuilt from data/raw by `reparse` (everything except raw_manifest).
PARSED_TABLES = ("moh_bed_waits", "moh_ed_attendances", "chas_clinics", "nuhs_live_waits",
                 "pop_65plus_by_area", "annual_ae_attendances", "source_metadata")
# Tables of retired sources. `reparse` drops them; their presence marks a warehouse as stale.
RETIRED_TABLES = ("has_clinics", "singhealth_xray_waits", "singstat_tabledata", "quarantine_singstat_tabledata")

# Primary key of every table that goes through the data-quality gate. Each one gets a
# quarantine_<table> with the same columns (as VARCHAR, so any rejected value fits).
TABLE_KEYS: dict[str, tuple[str, ...]] = {
    "moh_bed_waits": ("hospital_name", "report_date"),
    "moh_ed_attendances": ("hospital_name", "report_date"),
    "chas_clinics": ("clinic_key",),
    "nuhs_live_waits": ("site_name", "department", "snapshot_timestamp"),
    "pop_65plus_by_area": ("planning_area", "year"),
    "annual_ae_attendances": ("year",),
    "source_metadata": ("dataset_id",),
}
QUARANTINE_TABLES = tuple(f"quarantine_{t}" for t in TABLE_KEYS)
# Everything `reparse` drops and rebuilds from data/raw. dq_results (a log) is kept.
REBUILT_TABLES = (*PARSED_TABLES, *QUARANTINE_TABLES, "dq_findings", "raw_manifest")


def _create_schema(con) -> None:
    """Run DDL, then derive each quarantine table from its clean table's columns."""
    for stmt in DDL:
        con.execute(stmt)
    for table in TABLE_KEYS:
        cols = con.execute("SELECT column_name FROM information_schema.columns WHERE table_name = ? "
                           "ORDER BY ordinal_position", [table]).fetchall()
        body = ", ".join(f'"{c}" VARCHAR' for (c,) in cols)
        con.execute(f"CREATE TABLE IF NOT EXISTS quarantine_{table} (row_key VARCHAR NOT NULL, "
                    f"check_ids VARCHAR NOT NULL, details VARCHAR, {body})")


class SchemaOutOfDate(RuntimeError):
    """The warehouse file was built with an older schema than the code defines."""


def _table_sql(con, tables) -> dict[str, str]:
    rows = con.execute("SELECT table_name, sql FROM duckdb_tables() WHERE table_name IN "
                       f"({', '.join('?' for _ in tables)})", list(tables)).fetchall()
    return dict(rows)


class Warehouse:
    """A thin DuckDB layer: creates the schema and upserts idempotently.

    With ``check_schema`` (the default), opening a warehouse whose tables differ from DDL
    raises SchemaOutOfDate: CREATE TABLE IF NOT EXISTS cannot change an existing table, so
    loading into it would silently use the old columns and keys. `reparse` opens with
    check_schema=False because it drops and recreates every table anyway.
    """

    def __init__(self, path: str | Path, check_schema: bool = True) -> None:
        import duckdb  # imported here so the parsers can be unit-tested without DuckDB
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.con = duckdb.connect(str(path))
        _create_schema(self.con)
        if check_schema:
            self._check_schema(duckdb)

    def _check_schema(self, duckdb) -> None:
        tables = (*REBUILT_TABLES, "dq_results")
        expected_con = duckdb.connect(":memory:")
        try:
            _create_schema(expected_con)
            expected = _table_sql(expected_con, tables)
        finally:
            expected_con.close()
        stale = sorted(t for t, sql in _table_sql(self.con, tables).items() if sql != expected.get(t))
        stale += sorted(_table_sql(self.con, RETIRED_TABLES))      # left over from retired sources
        if stale:
            self.con.close()
            raise SchemaOutOfDate(
                f"warehouse tables {stale} were built with an older schema. "
                "Rebuild them from data/raw with: sg-health reparse")

    def column_types(self, table: str) -> dict[str, str]:
        rows = self.con.execute(
            "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = ? "
            "ORDER BY ordinal_position", [table]).fetchall()
        return {name: dtype for name, dtype in rows}

    _column_types = column_types

    def not_null_columns(self, table: str) -> list[str]:
        rows = self.con.execute(
            "SELECT column_name FROM information_schema.columns WHERE table_name = ? "
            "AND is_nullable = 'NO' ORDER BY ordinal_position", [table]).fetchall()
        return [r[0] for r in rows]

    # -- data-quality state, written by quality.gate ------------------------ #
    def replace_batch_state(self, table: str, batch_keys: pd.DataFrame, rec: RawRecord) -> None:
        """Forget earlier findings/quarantine rows for these keys, and earlier file-level findings."""
        self.con.register("_batch_keys", batch_keys)
        try:
            self.con.execute("DELETE FROM dq_findings WHERE table_name = ? AND scope = 'row' "
                             "AND row_key IN (SELECT row_key FROM _batch_keys)", [table])
            self.con.execute(f"DELETE FROM quarantine_{table} WHERE row_key IN (SELECT row_key FROM _batch_keys)")
        finally:
            self.con.unregister("_batch_keys")
        self.con.execute("DELETE FROM dq_findings WHERE table_name = ? AND scope <> 'row'", [table])

    def insert_quarantine(self, table: str, rows: pd.DataFrame) -> int:
        """Store rejected rows as text, exactly as parsed (None stays NULL)."""
        cols = [c for c in self.column_types(f"quarantine_{table}") if c in rows.columns]
        text = rows[cols].astype(object).where(rows[cols].notna(), None)
        text = text.map(lambda v: None if v is None else str(v))
        col_list = ", ".join(f'"{c}"' for c in cols)
        self.con.register("_q", text)
        try:
            self.con.execute(f"INSERT INTO quarantine_{table} ({col_list}) SELECT {col_list} FROM _q")
        finally:
            self.con.unregister("_q")
        return len(text)

    def insert_findings(self, findings: list, rec: RawRecord) -> int:
        if not findings:
            return 0
        from .quality.model import key_json
        df = pd.DataFrame([{
            "table_name": f.table, "check_id": f.check_id, "severity": f.check.severity.value,
            "scope": f.check.scope.value, "row_key": key_json(f.row_key) if f.row_key else None,
            "failing_rows": int(f.extra.get("failing_rows", 1)), "detail": f.detail,
            "source_url": link_url(rec.url), "source_sha256": rec.sha256} for f in findings])
        self.con.register("_f", df)
        try:
            self.con.execute("INSERT INTO dq_findings SELECT table_name, check_id, severity, scope, row_key, "
                             "failing_rows, detail, source_url, source_sha256 FROM _f")
        finally:
            self.con.unregister("_f")
        return len(df)

    def upsert(self, table: str, df: pd.DataFrame, keys: list[str]) -> int:
        """INSERT OR REPLACE on the primary key. Re-running never creates duplicate rows."""
        if df is None or df.empty:
            return 0
        types = self._column_types(table)
        cols = [c for c in df.columns if c in types]
        df = df[cols].drop_duplicates(subset=keys, keep="last")
        select = ", ".join(f'CAST("{c}" AS {types[c]}) AS "{c}"' for c in cols)
        col_list = ", ".join(f'"{c}"' for c in cols)
        self.con.register("_staging", df)
        try:
            self.con.execute(f"INSERT OR REPLACE INTO {table} ({col_list}) SELECT {select} FROM _staging")
        finally:
            self.con.unregister("_staging")
        return len(df)

    def sync_manifest(self, records: Iterable[RawRecord]) -> int:
        """Replace raw_manifest with the given records (normally all of manifest.jsonl)."""
        df = pd.DataFrame([asdict(r) for r in records],
                          columns=[f.name for f in fields(RawRecord)])
        self.con.execute("DELETE FROM raw_manifest")
        return self.upsert("raw_manifest", df, ["seq"])

    def reset(self) -> None:
        """Drop and recreate every table rebuilt from data/raw, on the current schema.

        Used by `reparse`. Dropping rather than deleting also picks up schema changes.
        dq_results is a log of past validation runs and is kept.
        """
        for table in (*REBUILT_TABLES, *RETIRED_TABLES):
            self.con.execute(f"DROP TABLE IF EXISTS {table}")
        _create_schema(self.con)

    def snapshot(self, table: str) -> pd.DataFrame:
        """Every row of ``table`` in a stable order (all columns), for comparing two builds."""
        cols = ", ".join(f'"{c}"' for c in self._column_types(table))
        return self.query(f"SELECT * FROM {table} ORDER BY {cols}")

    def mark_inactive(self, table: str, key: str, present: Iterable[str]) -> None:
        """Before loading a full snapshot, flag rows inactive if their key is NOT in the snapshot.

        ``present`` is every key in the new snapshot, including rows the gate quarantined: a
        quarantined clinic is still listed upstream, so its last good row must stay active
        rather than look closed.
        """
        self.con.register("_present", pd.DataFrame({"k": list(present)}))
        try:
            self.con.execute(f'UPDATE {table} SET is_active = FALSE WHERE "{key}" NOT IN (SELECT k FROM _present)')
        finally:
            self.con.unregister("_present")

    def query(self, sql: str) -> pd.DataFrame:
        return self.con.execute(sql).df()

    def close(self) -> None:
        self.con.execute("CHECKPOINT")  # flush the WAL so the .duckdb file is complete before git commit
        self.con.close()
