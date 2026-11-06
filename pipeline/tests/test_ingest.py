"""End-to-end `run` against a fake HTTP client: everything lands in data/raw before parsing."""
import pandas as pd
import pytest

from sg_health import cli
from sg_health.raw import RawStore
from sg_health.warehouse import Warehouse

from conftest import CHAS_V2, SINGSTAT_TABLE, FakeHttp, source_routes

pytest.importorskip("duckdb")


def run_cli(monkeypatch, paths, routes, *args):
    fake = FakeHttp(routes)
    monkeypatch.setattr(cli, "PoliteHttp", lambda: fake)
    code = cli.main(["--db", str(paths["db"]), "--raw-dir", str(paths["raw"]),
                     "--report", str(paths["report"]), *args])
    assert code == 0
    return fake


def full_run(monkeypatch, paths, routes=None):
    return run_cli(monkeypatch, paths, routes or source_routes(),
                   "run", "--singstat-table", SINGSTAT_TABLE)


def query(paths, sql):
    wh = Warehouse(paths["db"])
    try:
        return wh.query(sql)
    finally:
        wh.close()


def test_run_lands_every_fetched_file_before_parsing(monkeypatch, paths):
    full_run(monkeypatch, paths)
    recs = RawStore(paths["raw"]).records()
    assert sorted({r.source for r in recs}) == [
        "datagov_chas", "datagov_has", "moh_bed_waits", "moh_ed_attendances", "moh_page",
        "nuhs_live", "singhealth_qwatch", "singstat"]
    for r in recs:
        assert (paths["raw"] / r.path).exists()
        assert r.path.startswith(f"{r.source}/{r.fetched_at.date().isoformat()}/{r.sha256}.")


def test_raw_manifest_table_mirrors_manifest_file(monkeypatch, paths):
    full_run(monkeypatch, paths)
    table = query(paths, "SELECT * FROM raw_manifest ORDER BY seq")
    recs = RawStore(paths["raw"]).records()
    assert list(table["seq"]) == [r.seq for r in recs]
    assert list(table["sha256"]) == [r.sha256 for r in recs]
    assert {"source", "url", "sha256", "bytes", "http_status", "content_type", "fetched_at"} <= set(table)


def test_run_loads_every_table(monkeypatch, paths):
    full_run(monkeypatch, paths)
    counts = {t: int(query(paths, f"SELECT COUNT(*) AS n FROM {t}")["n"][0]) for t in [
        "moh_bed_waits", "moh_ed_attendances", "nuhs_live_waits", "singhealth_xray_waits",
        "chas_clinics", "has_clinics", "singstat_tabledata", "pop_65plus_by_area"]}
    assert counts == {"moh_bed_waits": 5, "moh_ed_attendances": 4, "nuhs_live_waits": 2,
                      "singhealth_xray_waits": 2, "chas_clinics": 2, "has_clinics": 1,
                      "singstat_tabledata": 3, "pop_65plus_by_area": 1}


def test_signed_download_url_is_not_stored(monkeypatch, paths):
    full_run(monkeypatch, paths)
    chas = [r for r in RawStore(paths["raw"]).records() if r.source == "datagov_chas"]
    assert chas[0].url == "https://s3.example.com/chas.geojson"


def test_unchanged_moh_file_is_landed_but_not_reparsed(monkeypatch, paths):
    full_run(monkeypatch, paths)
    before = query(paths, "SELECT * FROM moh_bed_waits ORDER BY hospital_name, report_date")
    full_run(monkeypatch, paths)
    after = query(paths, "SELECT * FROM moh_bed_waits ORDER BY hospital_name, report_date")
    pd.testing.assert_frame_equal(before, after)            # ingested_at kept from the first fetch
    moh = [r for r in RawStore(paths["raw"]).records() if r.source == "moh_bed_waits"]
    assert len(moh) == 2 and moh[0].path == moh[1].path     # two fetches, one stored file


def test_clinic_missing_from_new_snapshot_is_kept_inactive(monkeypatch, paths):
    full_run(monkeypatch, paths)
    full_run(monkeypatch, paths, source_routes(chas=CHAS_V2))
    rows = query(paths, "SELECT clinic_key, is_active FROM chas_clinics ORDER BY clinic_key")
    assert rows.to_dict("records") == [{"clinic_key": "15M0211", "is_active": True},
                                       {"clinic_key": "15M0999", "is_active": False}]
