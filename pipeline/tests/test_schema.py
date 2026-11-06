"""An old warehouse file must not be loaded into silently: run refuses, reparse rebuilds it."""
import pytest

from sg_health import cli
from sg_health.warehouse import SchemaOutOfDate, Warehouse

duckdb = pytest.importorskip("duckdb")

OLD_NUHS = """CREATE TABLE nuhs_live_waits (
    site_name VARCHAR NOT NULL, patients_waiting INTEGER, est_bed_wait_hours DOUBLE,
    est_consult_wait_hours DOUBLE, source_updated_at TIMESTAMP,
    snapshot_timestamp TIMESTAMP NOT NULL, source_url VARCHAR NOT NULL,
    source_sha256 VARCHAR NOT NULL, ingested_at TIMESTAMP NOT NULL,
    PRIMARY KEY (site_name, snapshot_timestamp))"""


@pytest.fixture
def old_warehouse(paths):
    paths["db"].parent.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect(str(paths["db"]))
    con.execute(OLD_NUHS)
    con.close()
    return paths


def test_current_schema_opens(paths):
    Warehouse(paths["db"]).close()
    Warehouse(paths["db"]).close()          # reopening an up-to-date file is fine


def test_old_schema_is_refused(old_warehouse):
    with pytest.raises(SchemaOutOfDate, match=r"nuhs_live_waits.*sg-health reparse"):
        Warehouse(old_warehouse["db"])


def test_run_exits_2_on_old_schema_and_reparse_fixes_it(old_warehouse):
    p = old_warehouse
    common = ["--db", str(p["db"]), "--raw-dir", str(p["raw"]), "--report", str(p["report"])]
    assert cli.main([*common, "report"]) == 2
    assert cli.main([*common, "reparse"]) == 0
    Warehouse(p["db"]).close()              # now current
    assert cli.main([*common, "report"]) == 0
