"""Retired sources (SingHealth QWatch, HAS clinics): raw history is kept but not parsed, old tables go."""
import logging

import pytest
from test_ingest import full_run

from sg_health import cli
from sg_health.raw import RawStore
from sg_health.warehouse import RETIRED_TABLES, SchemaOutOfDate, Warehouse

duckdb = pytest.importorskip("duckdb")


def common(p):
    return ["--db", str(p["db"]), "--raw-dir", str(p["raw"]), "--report", str(p["report"])]


def test_run_no_longer_fetches_retired_sources(monkeypatch, paths):
    fake = full_run(monkeypatch, paths)
    assert not any("singhealth" in u or "d_3cd840069e95b6a521aa5301a084b25a" in u for u in fake.calls)


def test_reparse_skips_retired_raw_files_quietly(monkeypatch, paths, caplog):
    full_run(monkeypatch, paths)
    store = RawStore(paths["raw"])          # raw history from before the source was retired
    store.save("singhealth_qwatch", "https://www.singhealth.com.sg/", b"<html>homepage</html>",
               http_status=200, content_type="text/html")
    with caplog.at_level(logging.WARNING):
        assert cli.main([*common(paths), "reparse"]) == 0
    assert not [r for r in caplog.records if "No loader" in r.getMessage()]
    assert any(r.source == "singhealth_qwatch" for r in RawStore(paths["raw"]).records())   # still kept


def test_leftover_retired_tables_mark_the_warehouse_stale_until_reparse(monkeypatch, paths):
    full_run(monkeypatch, paths)
    con = duckdb.connect(str(paths["db"]))
    con.execute("CREATE TABLE singhealth_xray_waits (site_name VARCHAR)")
    con.close()
    with pytest.raises(SchemaOutOfDate, match="singhealth_xray_waits"):
        Warehouse(paths["db"])
    assert cli.main([*common(paths), "reparse"]) == 0
    wh = Warehouse(paths["db"])
    try:
        left = wh.query("SELECT table_name FROM duckdb_tables()")["table_name"]
        assert not set(RETIRED_TABLES) & set(left)
    finally:
        wh.close()
