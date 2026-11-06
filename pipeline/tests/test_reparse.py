"""`reparse` rebuilds every table from data/raw alone: deterministic, offline, same as the live runs."""
import os
import shutil
import socket
from datetime import datetime

import pandas as pd
import pytest

from sg_health import cli
from sg_health.raw import RawStore
from sg_health.warehouse import PARSED_TABLES, Warehouse

from conftest import CHAS_V2, source_routes
from test_ingest import full_run

pytest.importorskip("duckdb")

ALL_TABLES = (*PARSED_TABLES, "raw_manifest")


def snapshots(db) -> dict[str, pd.DataFrame]:
    wh = Warehouse(db)
    try:
        return {t: wh.snapshot(t) for t in ALL_TABLES}
    finally:
        wh.close()


def assert_same_tables(a: dict, b: dict) -> None:
    for t in ALL_TABLES:
        pd.testing.assert_frame_equal(a[t], b[t], obj=t)


@pytest.fixture
def no_network(monkeypatch):
    """Fail the test if anything tries to open a connection or build an HTTP client."""
    def refuse(*_a, **_k):
        raise AssertionError("network access attempted during reparse")
    monkeypatch.setattr(socket.socket, "connect", refuse)
    monkeypatch.setattr(socket.socket, "connect_ex", refuse)
    monkeypatch.setattr(socket, "create_connection", refuse)
    monkeypatch.setattr(cli, "PoliteHttp", refuse)


def reparse_cli(paths, db=None):
    return cli.main(["--db", str(db or paths["db"]), "--raw-dir", str(paths["raw"]),
                     "--report", str(paths["report"]), "reparse"])


def set_clock(monkeypatch, when: datetime) -> None:
    """Pin every clock the pipeline could read. Correct loaders never read it (they use fetched_at),
    so a different clock at reparse time must not change any table."""
    monkeypatch.setattr("sg_health.raw.now_sgt", lambda: when)
    monkeypatch.setattr("sg_health.config.now_sgt", lambda: when)


@pytest.fixture
def history(monkeypatch, paths):
    """Two weekly runs: the second has a changed CHAS snapshot and an unchanged MOH file."""
    set_clock(monkeypatch, datetime(2026, 10, 25, 8, 0, 7))
    full_run(monkeypatch, paths)
    set_clock(monkeypatch, datetime(2026, 11, 1, 8, 0, 9))
    full_run(monkeypatch, paths, source_routes(chas=CHAS_V2))
    set_clock(monkeypatch, datetime(2026, 12, 31, 23, 59, 1))   # reparse happens "much later"
    return paths


def test_reparse_twice_gives_identical_tables(history, no_network, monkeypatch):
    assert reparse_cli(history) == 0
    first = snapshots(history["db"])
    set_clock(monkeypatch, datetime(2027, 3, 1, 12, 0, 0))     # a different "now" for the second run
    assert reparse_cli(history) == 0
    assert_same_tables(first, snapshots(history["db"]))
    assert len(first["moh_bed_waits"]) and len(first["chas_clinics"])


def test_reparse_into_a_new_warehouse_matches_the_live_runs(history, no_network, tmp_path):
    live = snapshots(history["db"])
    fresh_db = tmp_path / "fresh" / "warehouse.duckdb"
    assert reparse_cli(history, db=fresh_db) == 0
    assert_same_tables(live, snapshots(fresh_db))


def test_reparse_needs_only_data_raw(history, no_network, tmp_path):
    """Delete the warehouse entirely: data/raw alone is enough to rebuild it."""
    live = snapshots(history["db"])
    os.remove(history["db"])
    assert reparse_cli(history) == 0
    assert_same_tables(live, snapshots(history["db"]))


def test_reparse_replays_a_parser_fix(history, no_network, monkeypatch):
    """The point of the raw zone: change a parser, replay history, get corrected rows."""
    from sg_health import load
    original = load.LOADERS["datagov_chas"]

    def fixed(wh, rec, content, stats):
        return original(wh, rec, content.replace(b"JOO KOON CLINIC", b"JOO KOON CLINIC (fixed)"), stats)
    monkeypatch.setitem(load.LOADERS, "datagov_chas", fixed)
    assert reparse_cli(history) == 0
    names = snapshots(history["db"])["chas_clinics"]["clinic_name"]
    assert "JOO KOON CLINIC (fixed)" in set(names) and "JOO KOON CLINIC" not in set(names)


def test_reparse_reports_a_missing_raw_file_and_keeps_going(history, no_network):
    rec = next(r for r in RawStore(history["raw"]).records() if r.source == "nuhs_live")
    shutil.rmtree((history["raw"] / rec.path).parent)
    assert reparse_cli(history) == 1                     # non-zero exit: history is incomplete
    tables = snapshots(history["db"])
    assert len(tables["moh_bed_waits"]) and len(tables["chas_clinics"])   # the rest still loaded
