"""DuckDB warehouse: schema, idempotent upserts and file-hash bookkeeping."""
from __future__ import annotations

from pathlib import Path

import pandas as pd

from .config import now_sgt

DDL = [
    """CREATE TABLE IF NOT EXISTS moh_bed_waits (
        hospital_name VARCHAR NOT NULL, report_date DATE NOT NULL,
        median_wait_hours DOUBLE, hospital_code VARCHAR, source_file VARCHAR,
        ingested_at TIMESTAMP NOT NULL, PRIMARY KEY (hospital_name, report_date))""",
    """CREATE TABLE IF NOT EXISTS moh_ed_attendances (
        hospital_name VARCHAR NOT NULL, report_date DATE NOT NULL,
        total_attendances BIGINT, hospital_code VARCHAR, source_file VARCHAR,
        ingested_at TIMESTAMP NOT NULL, PRIMARY KEY (hospital_name, report_date))""",
    """CREATE TABLE IF NOT EXISTS chas_clinics (
        clinic_key VARCHAR PRIMARY KEY, clinic_name VARCHAR, address VARCHAR,
        postal_code VARCHAR, latitude DOUBLE, longitude DOUBLE, has_cdmp BOOLEAN,
        hci_code VARCHAR, programmes VARCHAR, is_active BOOLEAN, ingested_at TIMESTAMP NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS has_clinics (
        clinic_key VARCHAR PRIMARY KEY, clinic_name VARCHAR, address VARCHAR,
        postal_code VARCHAR, latitude DOUBLE, longitude DOUBLE, raw_json VARCHAR,
        is_active BOOLEAN, ingested_at TIMESTAMP NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS nuhs_live_waits (
        site_name VARCHAR NOT NULL, patients_waiting INTEGER, est_bed_wait_hours DOUBLE,
        est_consult_wait_hours DOUBLE, source_updated_at TIMESTAMP,
        snapshot_timestamp TIMESTAMP NOT NULL, PRIMARY KEY (site_name, snapshot_timestamp))""",
    """CREATE TABLE IF NOT EXISTS singhealth_xray_waits (
        site_group VARCHAR, site_name VARCHAR NOT NULL, wait_minutes INTEGER, status VARCHAR,
        snapshot_timestamp TIMESTAMP NOT NULL, PRIMARY KEY (site_name, snapshot_timestamp))""",
    """CREATE TABLE IF NOT EXISTS singstat_tabledata (
        table_id VARCHAR NOT NULL, row_label VARCHAR NOT NULL, column_path VARCHAR NOT NULL,
        value DOUBLE, ingested_at TIMESTAMP NOT NULL,
        PRIMARY KEY (table_id, row_label, column_path))""",
    """CREATE TABLE IF NOT EXISTS pop_65plus_by_area (
        planning_area VARCHAR NOT NULL, year INTEGER NOT NULL, residents_65plus BIGINT,
        source_table VARCHAR, ingested_at TIMESTAMP NOT NULL, PRIMARY KEY (planning_area, year))""",
    """CREATE TABLE IF NOT EXISTS ingestion_log (
        sha256 VARCHAR PRIMARY KEY, source VARCHAR, url VARCHAR,
        fetched_at TIMESTAMP, rows_loaded INTEGER)""",
]


class Warehouse:
    """A thin DuckDB layer: creates the schema, upserts idempotently and records file hashes."""

    def __init__(self, path: str | Path) -> None:
        import duckdb  # imported here so the parsers can be unit-tested without DuckDB
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.con = duckdb.connect(str(path))
        for stmt in DDL:
            self.con.execute(stmt)

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

    def seen(self, digest: str) -> bool:
        return self.con.execute("SELECT 1 FROM ingestion_log WHERE sha256 = ?", [digest]).fetchone() is not None

    def log_file(self, digest: str, source: str, url: str, rows: int) -> None:
        self.con.execute("INSERT OR REPLACE INTO ingestion_log VALUES (?, ?, ?, ?, ?)",
                         [digest, source, url, now_sgt(), rows])

    def mark_inactive(self, table: str) -> None:
        """Before loading a full snapshot, flag every row inactive; the reload re-activates current ones."""
        self.con.execute(f"UPDATE {table} SET is_active = FALSE")

    def query(self, sql: str) -> pd.DataFrame:
        return self.con.execute(sql).df()

    def close(self) -> None:
        self.con.execute("CHECKPOINT")  # flush the WAL so the .duckdb file is complete before git commit
        self.con.close()
