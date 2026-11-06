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


# --------------------------------------------------------------- MOH marts #

from sg_health.config import HOSPITAL_CLUSTER, HOSPITAL_REFERENCE, HOSPITALS  # noqa: E402

LINEAGE = {"source_url": "https://x/f.xlsx", "source_sha256": "a" * 64, "ingested_at": datetime(2026, 11, 2, 8)}


@pytest.fixture
def wh(tmp_path):
    w = Warehouse(tmp_path / "w.duckdb")
    yield w
    w.close()


def put(wh, table, value_col, rows, sha="a" * 64):
    """rows: (code, date, value)."""
    df = pd.DataFrame([{"hospital_code": c, "hospital_name": HOSPITALS[c][0], "report_date": d, value_col: v,
                        **LINEAGE, "source_sha256": sha} for c, d, v in rows])
    wh.upsert(table, df, ["hospital_name", "report_date"])


def week_of(start: date, values: dict[str, list]):
    return [(code, start + timedelta(days=i), v) for code, vals in values.items() for i, v in enumerate(vals) if v is not None]


def test_weekly_matches_a_hand_computation_for_one_week_of_all_nine_hospitals(wh):
    monday = date(2026, 10, 19)                                         # ISO 2026-W43
    waits = {code: [1.0 + n + d * 0.25 for d in range(7)] for n, code in enumerate(HOSPITAL_REFERENCE)}
    attend = {code: [100 * (n + 1) + d for d in range(7)] for n, code in enumerate(HOSPITAL_REFERENCE)}
    put(wh, "moh_bed_waits", "median_wait_hours", week_of(monday, waits))
    put(wh, "moh_ed_attendances", "total_attendances", week_of(monday, attend))
    run_transform(wh)
    mart = q(wh, "SELECT * FROM marts.fct_ed_weekly ORDER BY hospital_code").set_index("hospital_code")
    assert len(mart) == 9
    for code in HOSPITAL_REFERENCE:
        row = mart.loc[code]
        assert row.mean_of_daily_median_wait_hours == pytest.approx(sum(waits[code]) / 7, abs=1e-12)
        assert row.total_attendances == sum(attend[code])
        assert (row.iso_year, row.iso_week, row.days_reported_wait, row.is_complete_week) == (2026, 43, 7, True)
        assert row.week_start.date() == monday and row.week_end.date() == date(2026, 10, 25)
    assert str(mart["total_attendances"].dtype) == "int64"            # a count, not a float


def test_partial_week_is_not_filled_in(wh):
    monday = date(2026, 10, 26)
    put(wh, "moh_bed_waits", "median_wait_hours", week_of(monday, {"CGH": [2.0, 4.0, None, 6.0, None, None, None]}))
    run_transform(wh)
    row = q(wh, "SELECT * FROM marts.fct_ed_weekly").iloc[0]
    assert row.mean_of_daily_median_wait_hours == pytest.approx(4.0)   # mean of the 3 days reported
    assert (row.days_reported_wait, row.days_reported_attendances, row.is_complete_week) == (3, 0, False)
    assert pd.isna(row.total_attendances)                              # no attendance data: NULL, not 0


def test_a_day_with_only_one_metric_keeps_the_other_null(wh):
    d = date(2026, 10, 20)
    put(wh, "moh_bed_waits", "median_wait_hours", [("CGH", d, 5.0)], sha="w" * 64)
    put(wh, "moh_ed_attendances", "total_attendances", [("SGH", d, 400)], sha="e" * 64)
    run_transform(wh)
    daily = q(wh, "SELECT hospital_code, median_wait_hours, attendances, wait_source_sha256, "
                  "attendance_source_sha256 FROM marts.fct_ed_daily ORDER BY 1").to_dict("records")
    assert daily[0]["hospital_code"] == "CGH" and daily[0]["median_wait_hours"] == 5.0
    assert pd.isna(daily[0]["attendances"]) and pd.isna(daily[0]["attendance_source_sha256"])
    assert daily[1]["attendances"] == 400 and pd.isna(daily[1]["median_wait_hours"])
    assert daily[0]["wait_source_sha256"] == "w" * 64 and daily[1]["attendance_source_sha256"] == "e" * 64


def test_daily_carries_warn_flags_and_as_of(wh):
    d = date(2026, 10, 20)
    put(wh, "moh_bed_waits", "median_wait_hours", [("KTPH", d, 30.0), ("CGH", d, 3.0)])
    wh.con.execute("INSERT INTO dq_findings VALUES ('moh_bed_waits', 'range.bed_wait_over_24h', 'WARN', 'row', "
                   "'{\"hospital_name\": \"Khoo Teck Puat Hospital\", \"report_date\": \"2026-10-20\"}', 1, "
                   "'30 h', 'u', 's')")
    run_transform(wh)
    rows = q(wh, "SELECT hospital_code, dq_flags, as_of, as_of_basis FROM marts.fct_ed_daily ORDER BY 1")
    assert rows.set_index("hospital_code").loc["KTPH", "dq_flags"] == "range.bed_wait_over_24h"
    assert pd.isna(rows.set_index("hospital_code").loc["CGH", "dq_flags"])
    assert (rows["as_of"] == pd.Timestamp(LINEAGE["ingested_at"])).all() and set(rows["as_of_basis"]) == {"fetched"}


def test_dim_hospital_matches_the_reference_in_code(wh):
    run_transform(wh)
    dim = q(wh, "SELECT * FROM marts.dim_hospital").set_index("hospital_code")
    assert set(dim.index) == set(HOSPITAL_REFERENCE)
    for code, (ftype, valid_from) in HOSPITAL_REFERENCE.items():
        assert dim.loc[code, "facility_type"] == ftype and dim.loc[code, "cluster"] == HOSPITAL_CLUSTER[code]
    assert dim.loc["AH", "facility_type"] == "UCC" and "adult" in dim.loc["NUH", "coverage_note"].lower()
    assert dim.loc["WH", "reported_from"].date() == date(2024, 6, 23) and dim["source_sha256"].nunique() == 1


def test_marts_are_identical_when_rebuilt(built):
    tables = ["dim_hospital", "fct_ed_daily", "fct_ed_weekly"]
    first = {t: q(built, f"SELECT * FROM marts.{t}") for t in tables}
    run_transform(built)
    for t in tables:
        pd.testing.assert_frame_equal(first[t], q(built, f"SELECT * FROM marts.{t}"), obj=t)


# ------------------------------------------------------------------ clinics #

def test_dim_clinic_as_of_is_the_upstream_update_not_our_download(built):
    rows = q(built, "SELECT clinic_key, as_of, as_of_basis, fetched_at FROM marts.dim_clinic")
    assert len(rows) == 2
    assert (rows["as_of"] == pd.Timestamp("2024-06-06 14:36:42")).all()      # SGT, from lastUpdatedAt
    assert set(rows["as_of_basis"]) == {"source_updated"}
    assert (rows["fetched_at"] > rows["as_of"]).all()                         # downloaded much later
    assert "on_has" not in rows.columns and "on_has" not in q(built, "SELECT * FROM marts.dim_clinic LIMIT 0").columns


def test_dim_clinic_falls_back_to_fetch_time_without_metadata(monkeypatch, paths):
    from sg_health import config
    from conftest import source_routes
    routes = {u: v for u, v in source_routes().items() if "/metadata" not in u}
    full_run(monkeypatch, paths, routes)
    wh = Warehouse(paths["db"])
    try:
        rows = q(wh, "SELECT as_of, as_of_basis, fetched_at FROM marts.dim_clinic")
    finally:
        wh.close()
    assert set(rows["as_of_basis"]) == {"fetched"} and (rows["as_of"] == rows["fetched_at"]).all()


def test_dim_clinic_keeps_is_active_and_has_cdmp(monkeypatch, paths):
    from conftest import CHAS_V2
    from conftest import source_routes
    full_run(monkeypatch, paths)
    full_run(monkeypatch, paths, source_routes(chas=CHAS_V2))
    wh = Warehouse(paths["db"])
    try:
        rows = q(wh, "SELECT clinic_key, is_active, has_cdmp FROM marts.dim_clinic ORDER BY 1").to_dict("records")
    finally:
        wh.close()
    assert rows == [{"clinic_key": "15M0211", "is_active": True, "has_cdmp": True},
                    {"clinic_key": "15M0999", "is_active": False, "has_cdmp": False}]


# ------------------------------------------------------------- live snapshot #

def test_live_snapshot_is_labelled_estimate_with_the_page_as_of(built):
    rows = q(built, "SELECT * FROM marts.fct_live_ed_snapshot ORDER BY site_name")
    assert len(rows) == len(q(built, "SELECT * FROM staging.stg_nuhs_live"))
    assert set(rows["measure_type"]) == {"estimate"}
    assert list(rows["hospital_code"]) == ["NUH", "NTFGH"]
    assert (rows["as_of"] == pd.Timestamp("2026-05-18 09:30:04")).all()       # the page's "Last updated at"
    assert set(rows["as_of_basis"]) == {"source_updated"}


def test_live_snapshot_without_a_page_timestamp_uses_the_fetch_time(monkeypatch, paths):
    from sg_health import config
    from conftest import HTML, NUHS_HTML, source_routes
    routes = source_routes()
    routes[config.NUHS_LIVE_URL] = (NUHS_HTML.replace(b"Last updated at 18 May 2026, 09:30:04 AM.", b""), HTML)
    full_run(monkeypatch, paths, routes)
    wh = Warehouse(paths["db"])
    try:
        rows = q(wh, "SELECT as_of, as_of_basis, fetched_at FROM marts.fct_live_ed_snapshot")
    finally:
        wh.close()
    assert set(rows["as_of_basis"]) == {"fetched"} and (rows["as_of"] == rows["fetched_at"]).all()


# ------------------------------------------------------------ documentation #

import re  # noqa: E402

from sg_health import config  # noqa: E402

MARTS = ["dim_hospital", "fct_ed_daily", "fct_ed_weekly", "dim_clinic", "fct_live_ed_snapshot",
         "fct_planning_area_population", "fct_area_access", "dim_metric"]


def documented_columns(mart: str) -> set[str]:
    doc = (config.REPO_ROOT / "docs" / "data_dictionary.md").read_text()
    section = re.search(rf"^### `marts\.{mart}`\n(.*?)(?=^##)", doc, re.S | re.M)
    assert section, f"marts.{mart} has no section in docs/data_dictionary.md"
    cols = set()
    for line in section.group(1).splitlines():
        if line.startswith("| `"):
            cols |= set(re.findall(r"`([a-z0-9_]+)`", line.split("|")[1]))
    return cols


@pytest.mark.parametrize("mart", MARTS)
def test_every_mart_column_is_in_the_data_dictionary(built, mart):
    actual = set(q(built, f"SELECT * FROM marts.{mart} LIMIT 0").columns)
    documented = documented_columns(mart)
    assert actual - documented == set(), f"undocumented columns in marts.{mart}"
    assert documented - actual == set(), f"documented but not in marts.{mart}"
    assert {"as_of", "as_of_basis"} <= actual and any("sha256" in c for c in actual)


def test_dim_clinic_tidies_whitespace_for_display_but_staging_keeps_it(monkeypatch, paths):
    from conftest import chas_geojson, source_routes
    full_run(monkeypatch, paths, source_routes(chas=chas_geojson([("C1", "BUKIT TIMAH NAM SANG  CLINIC ", "CHAS")])))
    wh = Warehouse(paths["db"])
    try:
        mart = q(wh, "SELECT clinic_name FROM marts.dim_clinic")["clinic_name"][0]
        staged = q(wh, "SELECT clinic_name FROM staging.stg_chas_clinics")["clinic_name"][0]
    finally:
        wh.close()
    assert mart == "BUKIT TIMAH NAM SANG CLINIC"
    assert staged == "BUKIT TIMAH NAM SANG  CLINIC"           # as published (the parser trims edges only)


def test_is_adult_ed_separates_nuh_sections_and_matches_the_reconciliation_rule(monkeypatch, paths):
    from sg_health import config
    from conftest import HTML, source_routes
    from test_nuhs import TWO_DEPARTMENTS
    routes = source_routes()
    routes[config.NUHS_LIVE_URL] = (TWO_DEPARTMENTS + b"<h3>Urgent Care</h3><table><tr><th></th><th>Somewhere</th></tr>"
                                    b"<tr><td>Number of Patients Waiting for Consult</td><td>1 patient(s)</td></tr></table>", HTML)
    full_run(monkeypatch, paths, routes)
    wh = Warehouse(paths["db"])
    try:
        rows = q(wh, "SELECT hospital_code, department, is_adult_ed FROM marts.fct_live_ed_snapshot ORDER BY 1, 2")
        adult_by_rule = q(wh, "SELECT site_name, department FROM main.nuhs_live_waits WHERE department ILIKE '%adult%'")
    finally:
        wh.close()
    nuh = rows[rows["hospital_code"] == "NUH"].set_index("department")["is_adult_ed"]
    assert bool(nuh["Adult Emergency"]) and not bool(nuh["Children's Emergency"])
    unknown = rows[rows["department"] == "Urgent Care"]
    assert len(unknown) == 1 and pd.isna(unknown["is_adult_ed"].iloc[0])     # neither: NULL, not guessed
    assert len(rows[rows["is_adult_ed"] == True]) == len(adult_by_rule)     # noqa: E712  same rows as the check
    one_per_hospital = rows[rows["is_adult_ed"] == True].groupby("hospital_code").size()   # noqa: E712
    assert (one_per_hospital == 1).all()


def test_population_mart_share_is_null_where_nobody_lives(built):
    rows = q(built, "SELECT * FROM marts.fct_planning_area_population ORDER BY planning_area").set_index("planning_area")
    assert rows.loc["Bedok", "share_65plus"] == pytest.approx(0.5)
    assert rows.loc["Tuas", "residents_total"] == 0 and pd.isna(rows.loc["Tuas", "share_65plus"])
    assert (rows["as_of"] == pd.Timestamp("2026-06-30")).all() and set(rows["as_of_basis"]) == {"reference_period"}


# ------------------------------------------------------------ clinic access #

def access_run(monkeypatch, paths, clinics, areas=None):
    from conftest import chas_geojson, planning_area_geojson, source_routes, PLANNING_AREAS_DOWNLOAD
    routes = source_routes(chas=chas_geojson(clinics))
    if areas is not None:
        routes[PLANNING_AREAS_DOWNLOAD] = (planning_area_geojson(areas), "application/geo+json")
    full_run(monkeypatch, paths, routes)
    wh = Warehouse(paths["db"])
    try:
        return (q(wh, "SELECT clinic_key, planning_area_code, planning_area, planning_area_assignment FROM marts.dim_clinic ORDER BY 1"),
                q(wh, "SELECT * FROM marts.fct_area_access ORDER BY planning_area").set_index("planning_area"))
    finally:
        wh.close()


def test_clinics_are_placed_in_the_area_that_contains_them(monkeypatch, paths):
    clinics, access = access_run(monkeypatch, paths, [
        ("C1", "BEDOK ONE", "CHAS,CDMP", (103.68, 1.33)), ("C2", "BEDOK TWO", "CHAS", (103.70, 1.34)),
        ("C3", "TUAS ONE", "CHAS,CDMP", (103.62, 1.30))])
    assert list(clinics["planning_area"]) == ["Bedok", "Bedok", "Tuas"]           # SingStat spelling
    assert set(clinics["planning_area_assignment"]) == {"inside"}
    assert (access.loc["Bedok", "chas_clinics"], access.loc["Bedok", "cdmp_clinics"]) == (2, 1)


def test_a_clinic_outside_every_area_is_left_unassigned_not_snapped(monkeypatch, paths):
    clinics, access = access_run(monkeypatch, paths, [
        ("C1", "IN BEDOK", "CHAS", (103.68, 1.33)), ("C2", "BETWEEN AREAS", "CHAS", (103.645, 1.33))])
    row = clinics.set_index("clinic_key").loc["C2"]
    assert pd.isna(row.planning_area_code) and row.planning_area_assignment == "outside_all"
    assert access["chas_clinics"].sum() == 1                                # only the placed one


def test_a_clinic_in_two_overlapping_areas_is_ambiguous(monkeypatch, paths):
    overlapping = [("BD", "BEDOK", "EAST", (103.65, 1.30, 103.72, 1.36)), ("TS", "TUAS", "WEST", (103.60, 1.28, 103.70, 1.34))]
    clinics, _ = access_run(monkeypatch, paths, [("C1", "IN BOTH", "CHAS", (103.68, 1.33))], areas=overlapping)
    assert clinics["planning_area_assignment"].iloc[0] == "ambiguous" and pd.isna(clinics["planning_area"].iloc[0])


def test_access_ratio_per_1000_aged_65_and_null_where_nobody_that_age_lives(monkeypatch, paths):
    _, access = access_run(monkeypatch, paths, [("C1", "A", "CHAS,CDMP", (103.68, 1.33)), ("C2", "B", "CHAS", (103.69, 1.33))])
    bedok = access.loc["Bedok"]                                                     # fixture: 1,000 residents aged 65+
    assert bedok.cdmp_clinics_per_1k_seniors == pytest.approx(1.0)
    assert bedok.clinics_per_1k_seniors == pytest.approx(2.0)
    tuas = access.loc["Tuas"]                                                       # 0 residents
    assert tuas.chas_clinics == 0 and pd.isna(tuas.cdmp_clinics_per_1k_seniors)


def test_access_as_of_is_the_older_input(monkeypatch, paths):
    _, access = access_run(monkeypatch, paths, [("C1", "A", "CHAS", (103.68, 1.33))])
    assert (access["clinics_as_of"] == pd.Timestamp("2024-06-06 14:36:42")).all()
    assert (access["population_as_of"] == pd.Timestamp("2026-06-30")).all()
    assert (access["as_of"] == access["clinics_as_of"]).all() and set(access["as_of_basis"]) == {"source_updated"}


def test_every_metric_points_at_a_real_mart_column_and_wait_units_are_inferred(built):
    metrics = q(built, "SELECT * FROM marts.dim_metric")
    for metric_id in metrics["metric_id"]:
        mart, col = metric_id.split(".")
        assert col in q(built, f"SELECT * FROM marts.{mart} LIMIT 0").columns, metric_id
    m = metrics.set_index("metric_id")
    assert m.loc["fct_ed_daily.median_wait_hours", "unit_basis"] == "inferred"
    assert "not stated by MOH" in m.loc["fct_ed_daily.median_wait_hours", "caveat"]
    assert set(metrics["unit_basis"]) <= {"stated", "inferred"} and metrics["caveat"].str.len().gt(0).all()


def test_access_keeps_every_area_with_empty_ratios_when_population_is_missing(monkeypatch, paths):
    """First CI run: SingStat refused the runner. The mart must not crash or drop areas."""
    from sg_health import config
    from conftest import chas_geojson, source_routes
    routes = source_routes(chas=chas_geojson([("C1", "A", "CHAS,CDMP", (103.68, 1.33))]))
    del routes[config.SINGSTAT_RESIDENTS_URL]
    monkeypatch.setattr("sg_health.sources.singstat.SINGSTAT_RESIDENTS_SEED", paths["raw"] / "no-seed.zip")
    full_run(monkeypatch, paths, routes)
    wh = Warehouse(paths["db"])
    try:
        access = q(wh, "SELECT * FROM marts.fct_area_access ORDER BY planning_area")
        log = q(wh, "SELECT status FROM main.transform_log")
    finally:
        wh.close()
    assert len(access) == 2 and access["residents_65plus"].isna().all()
    assert access["cdmp_clinics_per_1k_seniors"].isna().all()
    assert int(access["chas_clinics"].sum()) == 1                    # clinics still counted
    assert set(log["status"]) <= {"ok", "explained"}                        # no transform failure
