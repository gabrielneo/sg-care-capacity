"""Publish a snapshot of the marts: what the API and site read. See docs/runbook.md.

    data/build/publish/
      analytics.duckdb                 ONLY the marts schema plus dq_results; checkpointed, read-only
      parquet/<mart>.parquet           one per mart
      planning_area_access.geojson     the web map layer
      planning_area_access_svy21.geojson   the 3D map layer (SVY21 metres)
      manifest.json                    snapshot_id, as_of per source, row counts, coverage per hospital,
                                       check summary, sha256 of every artefact, pipeline git commit

Publishing re-runs validation and refuses if any check blocks publishing (an ERROR at file or
dataset level). Rows quarantined by row-level ERRORs are already excluded from the marts, so they
don't block; they are counted in the manifest. The GitHub Release upload happens in CI.
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import stat
import subprocess
from datetime import date
from pathlib import Path

import pandas as pd

from . import config
from .quality import validate as dq
from .warehouse import Warehouse

ANALYTICS_DB = "analytics.duckdb"
MANIFEST = "manifest.json"
INSIGHTS_JSON = "insights.json"
SNAPSHOT_PREFIX = "data-"
KEEP_SNAPSHOTS = 12


class PublishBlocked(RuntimeError):
    """Validation has a failing check that blocks publishing."""


def snapshot_id(day: date) -> str:
    return f"{SNAPSHOT_PREFIX}{day.isoformat()}"


def _sql_path(p: Path) -> str:
    return str(p).replace("'", "''")


def _git_commit() -> str | None:
    if os.getenv("GITHUB_SHA"):
        return os.environ["GITHUB_SHA"]
    try:
        return subprocess.run(["git", "rev-parse", "HEAD"], cwd=config.REPO_ROOT, capture_output=True,
                              text=True, check=True, timeout=10).stdout.strip() or None
    except (OSError, subprocess.SubprocessError):
        return None


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _iso(v):
    return None if v is None or (not isinstance(v, str) and pd.isna(v)) else (v.isoformat() if hasattr(v, "isoformat") else v)


def _day(v):
    return None if v is None or pd.isna(v) else pd.Timestamp(v).date().isoformat()


def mart_names(wh: Warehouse) -> list[str]:
    return [r[0] for r in wh.con.execute(
        "SELECT table_name FROM duckdb_tables() WHERE schema_name = 'marts' ORDER BY table_name").fetchall()]


# --------------------------------------------------------------------------- #
# Manifest sections
# --------------------------------------------------------------------------- #

def sources_as_of(wh: Warehouse) -> dict:
    """For each raw source: when it was last fetched, and how current its data is (with basis)."""
    q = lambda sql: wh.con.execute(sql).fetchall()
    fetched = dict(q("SELECT source, max(fetched_at) FROM main.raw_manifest GROUP BY 1"))
    updated = dict(q("SELECT source, max(last_updated_at) FROM main.source_metadata GROUP BY 1"))
    data_as_of = {
        "moh_bed_waits": (q("SELECT max(report_date) FROM main.moh_bed_waits")[0][0], "latest report_date"),
        "moh_ed_attendances": (q("SELECT max(report_date) FROM main.moh_ed_attendances")[0][0], "latest report_date"),
        "nuhs_live": (q("SELECT max(coalesce(source_updated_at, snapshot_timestamp)) FROM main.nuhs_live_waits")[0][0],
                      "NUHS 'Last updated at'"),
        "singstat_residents": (q("SELECT make_date(max(year), 6, 30) FROM main.pop_65plus_by_area")[0][0],
                               "reference date (end of June)"),
    }
    from .load import LOADERS
    out = {}
    # Data sources only: not bookkeeping (moh_page, datagov_metadata) and not retired sources.
    for source in sorted(s for s in fetched if s in LOADERS and s != "datagov_metadata"):
        as_of, basis = data_as_of.get(source, (updated.get(source), "data.gov.sg lastUpdatedAt"))
        out[source] = {"last_fetched_at": _iso(fetched.get(source)), "as_of": _iso(as_of),
                       "as_of_basis": basis if as_of is not None else None}
    return out


def coverage_per_hospital(wh: Warehouse) -> dict:
    df = wh.query("""
        SELECT h.hospital_code, h.hospital_name, h.reported_from,
               min(d.report_date) AS first_day, max(d.report_date) AS last_day,
               count(d.median_wait_hours) AS days_with_wait, count(d.attendances) AS days_with_attendances
        FROM marts.dim_hospital h LEFT JOIN marts.fct_ed_daily d USING (hospital_code)
        GROUP BY ALL ORDER BY h.hospital_code""")
    series_start = df["first_day"].min()
    series_end = df["last_day"].max()
    out = {}
    for r in df.itertuples():
        start = r.reported_from if pd.notna(r.reported_from) else series_start
        expected = (pd.Timestamp(series_end) - pd.Timestamp(start)).days + 1 if pd.notna(start) and pd.notna(series_end) else 0
        out[r.hospital_code] = {
            "hospital_name": r.hospital_name, "first_day": _day(r.first_day), "last_day": _day(r.last_day),
            "expected_days": int(expected), "days_with_wait": int(r.days_with_wait),
            "days_with_attendances": int(r.days_with_attendances),
            "missing_wait_days": int(expected - r.days_with_wait),
            "missing_attendance_days": int(expected - r.days_with_attendances)}
    return out


def check_summary(run_id: str, wh: Warehouse) -> dict:
    """Counts for the manifest, read from the recorded run (dq_results), not from the validation results
    alone: the insight engine logs its skipped detectors into the same run after validation, and the
    manifest must count what the published dq_results holds (audit M-3)."""
    counts = {"pass": 0, "warn": 0, "fail": 0, "skipped": 0}
    failing = []
    rows = wh.con.execute('SELECT check_id, "table", severity, scope, status, failing_rows, blocks_publish '
                          "FROM main.dq_results WHERE run_id = ? ORDER BY check_id, \"table\"", [run_id]).fetchall()
    for check_id, table, severity, scope, status, failing_rows, blocks_publish in rows:
        if status == "pass":
            counts["pass"] += 1
        elif status == "skipped":
            counts["skipped"] += 1
        elif severity == "WARN":
            counts["warn"] += 1
        else:
            counts["fail"] += 1
        if status == "fail":
            failing.append({"check_id": check_id, "table": table, "severity": severity, "scope": scope,
                            "failing_rows": int(failing_rows), "blocks_publish": bool(blocks_publish)})
    tables = [t for (t,) in wh.con.execute("SELECT table_name FROM duckdb_tables() "
                                            "WHERE table_name LIKE 'quarantine_%' ORDER BY 1").fetchall()]
    quarantined = {t.removeprefix("quarantine_"): int(wh.con.execute(f"SELECT count(*) FROM main.{t}").fetchall()[0][0])
                   for t in tables}
    return {"run_id": run_id, "counts": counts, "blocking": sum(f["blocks_publish"] for f in failing),
            "failing": sorted(failing, key=lambda f: (f["severity"], f["check_id"], f["table"])),
            "quarantined_rows": {t: n for t, n in quarantined.items() if n}}


# --------------------------------------------------------------------------- #
# Build
# --------------------------------------------------------------------------- #

def _fresh_dir(path: Path) -> None:
    if path.exists():
        for p in path.rglob("*"):                      # analytics.duckdb is read-only: make removable
            p.chmod(p.stat().st_mode | stat.S_IWUSR)
        shutil.rmtree(path)
    path.mkdir(parents=True)


def build_snapshot(wh: Warehouse, out_dir: Path, day: date | None = None) -> dict:
    """Validate, then write the snapshot into a fresh out_dir. Returns the manifest."""
    results = dq.run_validation(wh)
    blocking = [r for r in results if r.blocking]
    run_id = dq.record(wh, results)
    if blocking:
        raise PublishBlocked("not publishing: " + "; ".join(
            f"{r.check.check_id} ({r.table}): {r.details[:120]}" for r in blocking))
    if not mart_names(wh):
        raise PublishBlocked("not publishing: no marts built (run sg-health transform)")
    day = day or config.now_sgt().date()
    # Insight engine: after transform, before the snapshot. Builds marts.fct_insight and logs its
    # skipped detectors into this validation run, so the published dq_results include them.
    from . import insights
    insight_run = insights.run_in_warehouse(wh, run_id, day)
    marts = mart_names(wh)
    out_dir = Path(out_dir)
    _fresh_dir(out_dir)

    # analytics.duckdb: built from scratch, only marts + dq_results, checkpointed, read-only.
    analytics = out_dir / ANALYTICS_DB
    con = wh.con
    con.execute(f"ATTACH '{_sql_path(analytics)}' AS pub")
    try:
        con.execute("CREATE SCHEMA pub.marts")
        for m in marts:
            con.execute(f"CREATE TABLE pub.marts.{m} AS SELECT * FROM marts.{m} ORDER BY ALL")
        con.execute('CREATE TABLE pub.main.dq_results AS SELECT * FROM main.dq_results '
                    'ORDER BY checked_at, run_id, check_id, "table"')
        con.execute("CHECKPOINT pub")
    finally:
        con.execute("DETACH pub")
    analytics.chmod(stat.S_IRUSR | stat.S_IRGRP | stat.S_IROTH)
    _verify_analytics(analytics, marts, wh)

    parquet_dir = out_dir / "parquet"
    parquet_dir.mkdir()
    for m in marts:
        con.execute(f"COPY (SELECT * FROM marts.{m} ORDER BY ALL) TO '{_sql_path(parquet_dir / (m + '.parquet'))}' "
                    "(FORMAT parquet)")

    from .geo import SVY21_GEOJSON_NAME, WEB_GEOJSON_NAME
    for name in (WEB_GEOJSON_NAME, SVY21_GEOJSON_NAME):
        layer = wh.path.parent / "web" / name
        if layer.exists():
            shutil.copyfile(layer, out_dir / name)
    (out_dir / INSIGHTS_JSON).write_text(json.dumps(insights.to_json(insight_run), indent=2, sort_keys=True, default=str) + "\n")

    manifest = {
        "snapshot_id": snapshot_id(day),
        "created_at": config.now_sgt().isoformat(),
        "pipeline_commit": _git_commit(),
        "sources": sources_as_of(wh),
        "row_counts": {m: int(con.execute(f"SELECT count(*) FROM marts.{m}").fetchall()[0][0]) for m in marts},
        "coverage_per_hospital": coverage_per_hospital(wh),
        "checks": check_summary(run_id, wh),
        "insights": {"published": len(insight_run.insights), "skipped": len(insight_run.skips),
                     "headline": [r["insight_id"] for r in sorted(insight_run.insights, key=lambda r: r["headline_rank"] or 99)
                                  if r["headline_rank"]]},
        "artefacts": {p.relative_to(out_dir).as_posix(): {"sha256": _sha256(p), "bytes": p.stat().st_size}
                      for p in sorted(out_dir.rglob("*")) if p.is_file()},
    }
    (out_dir / MANIFEST).write_text(json.dumps(manifest, indent=2, sort_keys=True, default=str) + "\n")
    return manifest


def _verify_analytics(path: Path, marts: list[str], wh: Warehouse) -> None:
    import duckdb
    ro = duckdb.connect(str(path), read_only=True)
    try:
        tables = {(s, t) for s, t in ro.execute("SELECT schema_name, table_name FROM duckdb_tables()").fetchall()}
        expected = {("marts", m) for m in marts} | {("main", "dq_results")}
        if tables != expected:
            raise PublishBlocked(f"analytics.duckdb has {sorted(tables)}, expected {sorted(expected)}")
        for m in marts:
            a = ro.execute(f"SELECT count(*) FROM marts.{m}").fetchall()[0][0]
            b = wh.con.execute(f"SELECT count(*) FROM marts.{m}").fetchall()[0][0]
            if a != b:
                raise PublishBlocked(f"analytics.duckdb marts.{m}: {a} rows, warehouse has {b}")
    finally:
        ro.close()


def verify_manifest(out_dir: Path) -> list[str]:
    """Problems with a published directory: missing files or hash mismatches. Empty if all is well."""
    out_dir = Path(out_dir)
    manifest = json.loads((out_dir / MANIFEST).read_text())
    problems = []
    for rel, meta in manifest["artefacts"].items():
        p = out_dir / rel
        if not p.exists():
            problems.append(f"{rel}: missing")
        elif _sha256(p) != meta["sha256"]:
            problems.append(f"{rel}: sha256 mismatch")
    return problems


def snapshots_to_prune(tags: list[str], keep: int = KEEP_SNAPSHOTS) -> list[str]:
    """Snapshot release tags (data-YYYY-MM-DD) beyond the newest `keep`. Other tags are never touched."""
    import re
    snaps = sorted((t for t in tags if re.fullmatch(r"data-\d{4}-\d{2}-\d{2}", t)), reverse=True)
    return snaps[keep:]
