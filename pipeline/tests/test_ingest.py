"""End-to-end `run` against a fake HTTP client: everything lands in data/raw before parsing."""
import pandas as pd
import pytest

from sg_health import cli
from sg_health.raw import RawStore
from sg_health.warehouse import Warehouse

from conftest import CHAS_V2, FakeHttp, source_routes

pytest.importorskip("duckdb")


def run_cli(monkeypatch, paths, routes, *args):
    fake = FakeHttp(routes)
    monkeypatch.setattr(cli, "PoliteHttp", lambda: fake)
    code = cli.main(["--db", str(paths["db"]), "--raw-dir", str(paths["raw"]),
                     "--report", str(paths["report"]), *args])
    assert code == 0
    return fake


def full_run(monkeypatch, paths, routes=None):
    return run_cli(monkeypatch, paths, routes or source_routes(), "run")


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
        "datagov_annual_ae", "datagov_chas", "datagov_metadata", "datagov_planning_areas", "datagov_polyclinics", "moh_bed_waits", "moh_ed_attendances", "moh_page", "nuhs_live",
        "singstat_residents"]
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
        "moh_bed_waits", "moh_ed_attendances", "nuhs_live_waits", "chas_clinics",
        "pop_65plus_by_area", "annual_ae_attendances", "source_metadata", "planning_area_boundaries", "polyclinics"]}
    assert counts == {"moh_bed_waits": 5, "moh_ed_attendances": 4, "nuhs_live_waits": 2,
                      "chas_clinics": 2, "pop_65plus_by_area": 2,
                      "annual_ae_attendances": 2, "source_metadata": 4, "planning_area_boundaries": 2,
                      "polyclinics": 2}


def test_signed_download_url_is_not_stored(monkeypatch, paths):
    full_run(monkeypatch, paths)
    chas = [r for r in RawStore(paths["raw"]).records() if r.source == "datagov_chas"]
    assert chas[0].url == "https://s3.example.com/blobs.data.gov.sg/d_548c33ea2d99e29ec63a7cc9edcccedc.geojson"


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


def test_redirected_page_records_the_url_the_bytes_came_from(monkeypatch, paths):
    """2026-11-06: a retired page (SingHealth QWatch) redirected to a homepage. Lineage must say so."""
    from sg_health import config
    routes = source_routes()
    content, ctype = routes[config.NUHS_LIVE_URL]
    routes[config.NUHS_LIVE_URL] = (content, ctype, "https://www.nuhs.edu.sg/moved")
    full_run(monkeypatch, paths, routes)
    rec = next(r for r in RawStore(paths["raw"]).records() if r.source == "nuhs_live")
    assert rec.url == "https://www.nuhs.edu.sg/moved"


# ------------------------------------------------- SingStat: live first, pinned copy second #

def _singstat_records(paths):
    return [r for r in RawStore(paths["raw"]).records() if r.source == "singstat_residents"]


def _pin(monkeypatch, tmp_path, content):
    import hashlib
    seed = tmp_path / "seed.zip"
    seed.write_bytes(content)
    monkeypatch.setattr("sg_health.sources.singstat.SINGSTAT_RESIDENTS_SEED", seed)
    monkeypatch.setattr("sg_health.sources.singstat.SINGSTAT_RESIDENTS_SEED_SHA256", hashlib.sha256(content).hexdigest())
    return seed


def test_singstat_live_download_is_used_when_it_works(monkeypatch, paths, tmp_path):
    from conftest import singstat_residents_zip
    _pin(monkeypatch, tmp_path, singstat_residents_zip(rows=[("Old", "X", "65_to_69", "Males", "Others", 10, 2025)]))
    full_run(monkeypatch, paths)                                          # live route serves SINGSTAT_ZIP
    recs = _singstat_records(paths)
    assert len(recs) == 1 and recs[0].http_status == 200
    assert set(query(paths, "SELECT planning_area FROM pop_65plus_by_area")["planning_area"]) == {"Bedok", "Tuas"}


def test_pinned_copy_is_used_when_singstat_refuses(monkeypatch, paths, tmp_path):
    from sg_health import config
    from conftest import SINGSTAT_ZIP
    _pin(monkeypatch, tmp_path, SINGSTAT_ZIP)
    routes = source_routes()
    del routes[config.SINGSTAT_RESIDENTS_URL]                            # SingStat refuses (403 -> None)
    full_run(monkeypatch, paths, routes)
    recs = _singstat_records(paths)
    assert len(recs) == 1 and recs[0].http_status is None              # not from an HTTP response
    assert recs[0].url == config.SINGSTAT_RESIDENTS_URL                 # provenance: SingStat's file
    assert len(query(paths, "SELECT * FROM pop_65plus_by_area")) == 2


def test_pinned_copy_with_the_wrong_hash_is_refused(monkeypatch, paths, tmp_path):
    from sg_health import config
    from conftest import SINGSTAT_ZIP
    _pin(monkeypatch, tmp_path, SINGSTAT_ZIP)
    monkeypatch.setattr("sg_health.sources.singstat.SINGSTAT_RESIDENTS_SEED_SHA256", "0" * 64)
    routes = source_routes()
    del routes[config.SINGSTAT_RESIDENTS_URL]
    full_run(monkeypatch, paths, routes)
    assert _singstat_records(paths) == []
    assert query(paths, "SELECT * FROM pop_65plus_by_area").empty


def test_the_committed_pinned_copy_matches_its_recorded_hash_and_parses():
    import hashlib
    from sg_health import config
    from sg_health.parsers.singstat import parse_residents_zip
    content = config.SINGSTAT_RESIDENTS_SEED.read_bytes()
    assert hashlib.sha256(content).hexdigest() == config.SINGSTAT_RESIDENTS_SEED_SHA256
    out = parse_residents_zip(content)
    assert out["planning_area"].nunique() == 55 and int(out["residents_65plus"].sum()) == 828_010
