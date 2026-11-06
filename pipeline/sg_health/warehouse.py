"""DuckDB warehouse: schema, idempotent upserts and the raw_manifest mirror."""
from __future__ import annotations

from dataclasses import asdict, fields
from pathlib import Path
from typing import Iterable

import pandas as pd

from .raw import RawRecord

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
    """CREATE TABLE IF NOT EXISTS singstat_tabledata (
        table_id VARCHAR NOT NULL, row_label VARCHAR NOT NULL, column_path VARCHAR NOT NULL,
        value DOUBLE, source_url VARCHAR NOT NULL, source_sha256 VARCHAR NOT NULL, ingested_at TIMESTAMP NOT NULL,
        PRIMARY KEY (table_id, row_label, column_path))""",
    """CREATE TABLE IF NOT EXISTS pop_65plus_by_area (
        planning_area VARCHAR NOT NULL, year INTEGER NOT NULL, residents_65plus BIGINT,
        source_table VARCHAR, source_url VARCHAR NOT NULL, source_sha256 VARCHAR NOT NULL, ingested_at TIMESTAMP NOT NULL,
        PRIMARY KEY (planning_area, year))""",
    # One row per fetch, mirrored from data/raw/manifest.jsonl (the source of truth).
    """CREATE TABLE IF NOT EXISTS raw_manifest (
        seq INTEGER PRIMARY KEY, source VARCHAR NOT NULL, url VARCHAR NOT NULL,
        sha256 VARCHAR NOT NULL, bytes BIGINT NOT NULL, http_status INTEGER,
        content_type VARCHAR, fetched_at TIMESTAMP NOT NULL, path VARCHAR NOT NULL)""",
]

# Lineage columns carried by every parsed row (see docs/data_dictionary.md).
LINEAGE_COLUMNS = ("source_url", "source_sha256", "ingested_at")

# Tables rebuilt from data/raw by `reparse` (everything except raw_manifest).
PARSED_TABLES = ("moh_bed_waits", "moh_ed_attendances", "chas_clinics", "nuhs_live_waits",
                 "singstat_tabledata", "pop_65plus_by_area")
# Tables of retired sources. `reparse` drops them; their presence marks a warehouse as stale.
RETIRED_TABLES = ("has_clinics", "singhealth_xray_waits")


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
        for stmt in DDL:
            self.con.execute(stmt)
        if check_schema:
            self._check_schema(duckdb)

    def _check_schema(self, duckdb) -> None:
        tables = (*PARSED_TABLES, "raw_manifest")
        expected_con = duckdb.connect(":memory:")
        try:
            for stmt in DDL:
                expected_con.execute(stmt)
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

    def _column_types(self, table: str) -> dict[str, str]:
        rows = self.con.execute(
            "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = ?",
            [table]).fetchall()
        return {name: dtype for name, dtype in rows}

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
        """Drop and recreate every table (parsed tables and raw_manifest), on the current schema.

        Used by `reparse`. Dropping rather than deleting also picks up schema changes.
        """
        for table in (*PARSED_TABLES, *RETIRED_TABLES, "raw_manifest"):
            self.con.execute(f"DROP TABLE IF EXISTS {table}")
        for stmt in DDL:
            self.con.execute(stmt)

    def snapshot(self, table: str) -> pd.DataFrame:
        """Every row of ``table`` in a stable order (all columns), for comparing two builds."""
        cols = ", ".join(f'"{c}"' for c in self._column_types(table))
        return self.query(f"SELECT * FROM {table} ORDER BY {cols}")

    def mark_inactive(self, table: str) -> None:
        """Before loading a full snapshot, flag every row inactive; the reload re-activates current ones."""
        self.con.execute(f"UPDATE {table} SET is_active = FALSE")

    def query(self, sql: str) -> pd.DataFrame:
        return self.con.execute(sql).df()

    def close(self) -> None:
        self.con.execute("CHECKPOINT")  # flush the WAL so the .duckdb file is complete before git commit
        self.con.close()
