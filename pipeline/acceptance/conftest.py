"""Acceptance tests: the real built data, read the way the site would read it.

Black box on purpose: plain DuckDB, read-only, no sg_health imports. Run with
    pytest -q pipeline/acceptance
after `sg-health run` (or `reparse`) has built data/build/warehouse.duckdb. Not part of the
offline unit suite (pipeline/tests), because it needs real data.
"""
import os
from pathlib import Path

import duckdb
import pytest

REPO = Path(__file__).resolve().parents[2]
DATA = Path(os.getenv("SG_HEALTH_DATA_DIR", REPO / "data"))
DB = DATA / "build" / "warehouse.duckdb"
RAW = DATA / "raw"


@pytest.fixture(scope="session")
def db():
    if not DB.exists():
        pytest.skip(f"no built warehouse at {DB}; run `sg-health run` first")
    con = duckdb.connect(str(DB), read_only=True)
    if not con.execute("SELECT count(*) FROM duckdb_tables() WHERE schema_name = 'marts'").fetchall()[0][0]:
        pytest.skip("warehouse has no marts; run `sg-health transform`")
    yield con
    con.close()


@pytest.fixture(scope="session")
def sql(db):
    def run(query, *params):
        return db.execute(query, list(params)).df()
    return run


@pytest.fixture(scope="session")
def raw_dir():
    return RAW


@pytest.fixture(scope="session")
def docs():
    return (REPO / "docs").resolve()
