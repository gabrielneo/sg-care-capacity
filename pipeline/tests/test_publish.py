"""sg-health publish: the gate, analytics.duckdb, Parquet, manifest, and snapshot pruning."""
import json
import stat
from datetime import date, datetime

import duckdb
import pytest
from test_ingest import full_run

from sg_health import cli
from sg_health.publish import KEEP_SNAPSHOTS, PublishBlocked, build_snapshot, snapshots_to_prune, verify_manifest
from sg_health.warehouse import Warehouse


@pytest.fixture
def built(monkeypatch, paths):
    monkeypatch.setattr("sg_health.config.now_sgt", lambda: datetime(2026, 10, 27, 9))   # fixture data is fresh
    full_run(monkeypatch, paths)
    return paths


def publish(paths, out, today=date(2026, 10, 27)):
    wh = Warehouse(paths["db"])
    try:
        return build_snapshot(wh, out, day=today)
    finally:
        wh.close()


def test_publish_writes_only_marts_and_dq_results_read_only(built, tmp_path):
    out = tmp_path / "publish"
    m = publish(built, out)
    db = out / "analytics.duckdb"
    assert not db.stat().st_mode & (stat.S_IWUSR | stat.S_IWGRP | stat.S_IWOTH)
    ro = duckdb.connect(str(db), read_only=True)
    try:
        tables = {f"{s}.{t}" for s, t in ro.execute("SELECT schema_name, table_name FROM duckdb_tables()").fetchall()}
        with pytest.raises(duckdb.Error):
            ro.execute("CREATE TABLE marts.x (a INT)")
    finally:
        ro.close()
    assert tables == {f"marts.{t}" for t in m["row_counts"]} | {"main.dq_results"}
    assert not any(t.startswith("main.") and t != "main.dq_results" for t in tables)       # no raw, no quarantine


def test_parquet_for_every_mart_with_matching_rows(built, tmp_path):
    out = tmp_path / "publish"
    m = publish(built, out)
    for mart, n in m["row_counts"].items():                 # read with DuckDB: no pyarrow dependency
        path = str(out / "parquet" / f"{mart}.parquet").replace("'", "''")
        assert duckdb.sql(f"SELECT count(*) FROM read_parquet('{path}')").fetchall()[0][0] == n


def test_manifest_contents_and_hashes(built, tmp_path):
    out = tmp_path / "publish"
    m = publish(built, out)
    assert m["snapshot_id"] == "data-2026-10-27" and verify_manifest(out) == []
    assert set(m["artefacts"]) >= {"analytics.duckdb", "parquet/fct_ed_daily.parquet", "planning_area_access.geojson"}
    assert json.loads((out / "manifest.json").read_text()) == json.loads(json.dumps(m, default=str))
    assert m["checks"]["blocking"] == 0 and set(m["checks"]["counts"]) == {"pass", "warn", "fail", "skipped"}
    assert m["sources"]["moh_bed_waits"]["as_of"] == "2026-10-26"
    assert "datagov_metadata" not in m["sources"] and "moh_page" not in m["sources"]
    cgh = m["coverage_per_hospital"]["CGH"]
    assert (cgh["first_day"], cgh["last_day"], cgh["days_with_wait"]) == ("2026-10-25", "2026-10-26", 2)


def test_a_tampered_artefact_is_detected(built, tmp_path):
    out = tmp_path / "publish"
    publish(built, out)
    (out / "parquet" / "dim_hospital.parquet").write_bytes(b"tampered")
    assert verify_manifest(out) == ["parquet/dim_hospital.parquet: sha256 mismatch"]


def test_publish_is_refused_when_a_check_blocks(built, tmp_path, monkeypatch):
    monkeypatch.setattr("sg_health.config.now_sgt", lambda: datetime(2027, 1, 30, 9))    # data 3 months stale
    out = tmp_path / "publish"
    with pytest.raises(PublishBlocked, match="freshness.moh_28_days"):
        publish(built, out, today=date(2027, 1, 30))
    assert not out.exists()                                                              # nothing written


def test_publish_command_exit_codes(built, tmp_path, monkeypatch):
    common = ["--db", str(built["db"]), "--raw-dir", str(built["raw"]), "--report", str(built["report"])]
    assert cli.main([*common, "publish", "--out", str(tmp_path / "ok")]) == 0
    monkeypatch.setattr("sg_health.config.now_sgt", lambda: datetime(2027, 1, 30, 9))
    assert cli.main([*common, "publish", "--out", str(tmp_path / "blocked")]) == 1


def test_republishing_the_same_day_replaces_the_previous_output(built, tmp_path):
    out = tmp_path / "publish"
    publish(built, out)
    (out / "stray.txt").write_text("left over")
    publish(built, out)                                                                  # read-only db too
    assert not (out / "stray.txt").exists() and verify_manifest(out) == []


@pytest.mark.parametrize("n_snapshots", [3, 12, 15])
def test_only_the_newest_12_snapshots_are_kept_and_other_releases_never(n_snapshots):
    snaps = [f"data-2026-{m:02d}-01" for m in range(1, 13)] + [f"data-2027-0{m}-01" for m in range(1, 4)]
    tags = snaps[:n_snapshots] + ["data-latest", "live-latest", "v1.0"]
    pruned = snapshots_to_prune(tags)
    assert len(pruned) == max(0, n_snapshots - KEEP_SNAPSHOTS)
    assert not {"data-latest", "live-latest", "v1.0"} & set(pruned)
    assert all(p < min(set(snaps[:n_snapshots]) - set(pruned)) for p in pruned)          # the oldest go first


def test_validate_writes_markdown_for_the_issue(built, tmp_path, monkeypatch):
    monkeypatch.setattr("sg_health.config.now_sgt", lambda: datetime(2027, 1, 30, 9))
    md = tmp_path / "dq.md"
    code = cli.main(["--db", str(built["db"]), "--raw-dir", str(built["raw"]), "--report", str(built["report"]),
                     "validate", "--markdown", str(md)])
    text = md.read_text()
    assert code == 1 and "`freshness.moh_28_days`" in text and "| **yes** |" in text and "No snapshot was published" in text
