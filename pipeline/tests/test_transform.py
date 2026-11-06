"""Transformation layer: staging views, mart tables, row-count reconciliation."""
import shutil
from datetime import date, datetime, timedelta

import pandas as pd
import pytest

from sg_health import transform
from sg_health.transform import TransformError, run_transform
from sg_health.warehouse import Warehouse

from test_ingest import full_run

pytest.importorskip("duckdb")


@pytest.fixture
def built(monkeypatch, paths):
    """A full fixture run (which also transforms), reopened for inspection."""
    full_run(monkeypatch, paths)
    wh = Warehouse(paths["db"])
    yield wh
    wh.close()


def q(wh, sql):
    return wh.query(sql)


# ------------------------------------------------------------------- staging #

def test_staging_is_typed_and_renamed_with_no_rows_lost(built):
    for stg, clean in [("stg_moh_bed_waits", "moh_bed_waits"), ("stg_moh_ed_attendances", "moh_ed_attendances"),
                       ("stg_chas_clinics", "chas_clinics"), ("stg_nuhs_live", "nuhs_live_waits")]:
        assert len(q(built, f"SELECT * FROM staging.{stg}")) == len(q(built, f"SELECT * FROM main.{clean}"))
    cols = q(built, "SELECT * FROM staging.stg_moh_ed_attendances LIMIT 0").columns
    assert "attendances" in cols and "fetched_at" in cols and "ingested_at" not in cols


def test_transform_log_accounts_for_every_model(built):
    log = q(built, "SELECT * FROM main.transform_log")
    assert set(log["status"]) <= {"ok", "explained"}
    assert (log["rows_in"] == log["rows_out"] + log["rows_dropped"]).all()


def test_an_unexplained_row_loss_stops_the_transform(built, tmp_path, monkeypatch):
    sql = tmp_path / "sql"
    shutil.copytree(transform.SQL_DIR, sql)
    broken = sql / "staging" / "stg_moh_bed_waits.sql"
    broken.write_text(broken.read_text().replace("FROM main.moh_bed_waits;",
                                                 "FROM main.moh_bed_waits WHERE hospital_code <> 'SGH';"))
    monkeypatch.setattr(transform, "SQL_DIR", sql)
    with pytest.raises(TransformError, match=r"stg_moh_bed_waits <- main.moh_bed_waits: 2 rows"):
        run_transform(built)


def test_quarantined_rows_are_logged_as_withheld_upstream(monkeypatch, paths):
    from conftest import chas_geojson, source_routes
    full_run(monkeypatch, paths, source_routes(chas=chas_geojson(
        [("C1", "GOOD", "CHAS"), ("C2", "IN THE SEA", "CHAS", (103.58, 1.016))])))
    wh = Warehouse(paths["db"])
    try:
        row = q(wh, "SELECT * FROM main.transform_log WHERE input = 'main.quarantine_chas_clinics'").iloc[0]
    finally:
        wh.close()
    assert (row.rows_dropped, row.status) == (1, "explained") and "data-quality gate" in row.reason
