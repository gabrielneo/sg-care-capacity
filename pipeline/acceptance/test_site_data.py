"""What the site needs from the marts. Each test is an expectation a page would rely on.

Written from the consumer's side: if one fails, a page would show something wrong, misleading or
broken. They are not tuned to the current data. A failure is a finding to fix or to decide on,
not a test to relax.
"""
import hashlib
import re
from datetime import date, datetime, timedelta
from urllib.parse import urlsplit

import pandas as pd
import pytest

SG_LAT, SG_LON = (1.15, 1.48), (103.6, 104.1)
AS_OF_BASES = {"source_updated", "fetched", "reference_checked", "reference_period"}
MARTS = ["dim_hospital", "fct_ed_daily", "fct_ed_weekly", "dim_clinic", "fct_live_ed_snapshot",
         "fct_planning_area_population", "fct_area_access", "dim_metric"]


def dupes(df: pd.DataFrame, keys: list[str]) -> pd.DataFrame:
    return df[df.duplicated(keys, keep=False)].sort_values(keys)


# =========================================================================== #
# Every page: each number carries as_of and a source the reader can follow
# =========================================================================== #

@pytest.mark.parametrize("mart", MARTS)
def test_every_row_has_as_of_and_a_known_basis(sql, mart):
    df = sql(f"SELECT as_of, as_of_basis FROM marts.{mart}")
    assert len(df), f"marts.{mart} is empty"
    assert df["as_of"].notna().all(), f"{df['as_of'].isna().sum()} rows in {mart} have no as_of"
    assert set(df["as_of_basis"]) <= AS_OF_BASES


@pytest.mark.parametrize("mart", MARTS)
def test_no_as_of_is_in_the_future(sql, mart):
    latest = sql(f"SELECT max(as_of) AS m FROM marts.{mart}")["m"][0]
    assert pd.Timestamp(latest) <= pd.Timestamp(datetime.now()) + pd.Timedelta(hours=8)   # SGT vs local


def _source_columns(sql, mart):
    cols = sql(f"SELECT * FROM marts.{mart} LIMIT 0").columns
    return [c for c in cols if c.endswith("source_url")]


@pytest.mark.parametrize("mart", ["fct_ed_daily", "dim_clinic", "fct_live_ed_snapshot", "fct_planning_area_population"])
def test_source_links_are_well_formed_urls(sql, mart):
    """The site renders source_url as a link. It must open: http(s), no raw spaces, no credentials."""
    bad = []
    for col in _source_columns(sql, mart):
        for url in sql(f"SELECT DISTINCT {col} AS u FROM marts.{mart} WHERE {col} IS NOT NULL")["u"]:
            parts = urlsplit(url)
            if parts.scheme not in ("http", "https") or not parts.netloc or " " in url \
                    or "signature" in parts.query.lower():
                bad.append(url)
    assert not bad, f"{len(bad)} unusable source links in {mart}, e.g. {bad[:3]}"


@pytest.mark.parametrize("mart, sha_cols", [
    ("fct_ed_daily", ["wait_source_sha256", "attendance_source_sha256"]),
    ("dim_clinic", ["source_sha256"]),
    ("fct_live_ed_snapshot", ["source_sha256"]),
    ("fct_planning_area_population", ["source_sha256"]),
])
def test_every_source_hash_resolves_to_an_unchanged_raw_file(sql, raw_dir, mart, sha_cols):
    """'Show me the source' must be answerable: the hash is in the manifest and the file still matches."""
    manifest = sql("SELECT DISTINCT sha256, path FROM main.raw_manifest")
    paths = dict(zip(manifest["sha256"], manifest["path"]))
    problems = []
    for col in sha_cols:
        for sha in sql(f"SELECT DISTINCT {col} AS s FROM marts.{mart} WHERE {col} IS NOT NULL")["s"]:
            if sha not in paths:
                problems.append(f"{sha[:12]} not in raw_manifest")
                continue
            f = raw_dir / paths[sha]
            if not f.exists():
                problems.append(f"{paths[sha]} missing on disk")
            elif hashlib.sha256(f.read_bytes()).hexdigest() != sha:
                problems.append(f"{paths[sha]} changed since it was fetched")
    assert not problems, problems


# =========================================================================== #
# Hospital list and filters (dim_hospital)
# =========================================================================== #

def test_hospital_list_is_the_nine_sites_with_unique_codes_and_names(sql):
    h = sql("SELECT * FROM marts.dim_hospital")
    assert len(h) == 9
    assert h["hospital_code"].is_unique and h["hospital_name"].is_unique


def test_cluster_filter_has_exactly_the_three_clusters_each_non_empty(sql):
    counts = sql("SELECT cluster, count(*) n FROM marts.dim_hospital GROUP BY 1").set_index("cluster")["n"]
    assert set(counts.index) == {"SingHealth", "NHG Health", "NUHS"} and (counts >= 1).all()


def test_alexandra_is_labelled_as_an_urgent_care_centre(sql):
    ah = sql("SELECT facility_type, hospital_name FROM marts.dim_hospital WHERE hospital_code = 'AH'")
    assert ah["facility_type"][0] == "UCC" and "UCC" in ah["hospital_name"][0]


def test_every_hospital_in_the_ed_data_uses_the_same_name_as_the_hospital_list(sql):
    mismatch = sql("""SELECT DISTINCT d.hospital_code, d.hospital_name AS fact_name, h.hospital_name AS dim_name
                      FROM marts.fct_ed_daily d LEFT JOIN marts.dim_hospital h USING (hospital_code)
                      WHERE h.hospital_name IS DISTINCT FROM d.hospital_name""")
    assert mismatch.empty, mismatch.to_dict("records")


def test_every_listed_hospital_has_ed_data(sql):
    missing = sql("""SELECT hospital_code FROM marts.dim_hospital
                     WHERE hospital_code NOT IN (SELECT DISTINCT hospital_code FROM marts.fct_ed_daily)""")
    assert missing.empty, f"hospitals with no data: {list(missing['hospital_code'])}"


# =========================================================================== #
# ED trends page (fct_ed_daily)
# =========================================================================== #

def test_one_row_per_hospital_per_day(sql):
    d = sql("SELECT hospital_code, report_date FROM marts.fct_ed_daily")
    assert dupes(d, ["hospital_code", "report_date"]).empty


def test_no_missing_days_inside_any_hospitals_series(sql):
    """A line chart draws a straight line across a missing day unless told; there should be none to hide."""
    gaps = sql("""
        WITH s AS (SELECT hospital_code, min(report_date) lo, max(report_date) hi, count(*) n
                   FROM marts.fct_ed_daily GROUP BY 1)
        SELECT hospital_code, lo, hi, n, CAST(hi - lo AS INTEGER) + 1 AS expected FROM s
        WHERE n <> CAST(hi - lo AS INTEGER) + 1""")
    assert gaps.empty, gaps.to_dict("records")


def test_every_hospital_ends_on_the_same_latest_day(sql):
    """The 'latest day' table compares hospitals side by side: they must all be on the same date."""
    ends = sql("SELECT hospital_code, max(report_date) AS last_day FROM marts.fct_ed_daily GROUP BY 1")
    assert ends["last_day"].nunique() == 1, ends.sort_values("last_day").to_dict("records")


def test_series_starts_where_the_hospital_list_says(sql):
    starts = sql("""SELECT h.hospital_code, h.reported_from, min(d.report_date) AS first_day
                    FROM marts.dim_hospital h JOIN marts.fct_ed_daily d USING (hospital_code) GROUP BY 1, 2""")
    series_start = starts["first_day"].min()
    for r in starts.itertuples():
        expected = r.reported_from if pd.notna(r.reported_from) else series_start
        assert pd.Timestamp(r.first_day) == pd.Timestamp(expected), (r.hospital_code, r.first_day, expected)


def test_data_is_fresh_enough_to_call_current(sql):
    last = pd.Timestamp(sql("SELECT max(report_date) m FROM marts.fct_ed_daily")["m"][0]).date()
    assert (date.today() - last).days <= 14, f"latest MOH day is {last}"


def test_wait_values_are_plausible_hours(sql):
    w = sql("SELECT median_wait_hours v FROM marts.fct_ed_daily WHERE median_wait_hours IS NOT NULL")["v"]
    assert (w >= 0).all() and (w <= 72).all()
    assert 1 <= w.median() <= 12, f"median of all daily medians is {w.median():.2f} h; unit looks wrong"


def test_no_emergency_department_reports_zero_attendances(sql):
    zero = sql("SELECT hospital_code, report_date FROM marts.fct_ed_daily WHERE attendances <= 0")
    assert zero.empty, zero.to_dict("records")


def test_lineage_is_present_exactly_when_the_value_is(sql):
    bad = sql("""SELECT count(*) FILTER (WHERE (median_wait_hours IS NULL) <> (wait_source_sha256 IS NULL)) w,
                        count(*) FILTER (WHERE (attendances IS NULL) <> (attendance_source_sha256 IS NULL)) a
                 FROM marts.fct_ed_daily""")
    assert (bad["w"][0], bad["a"][0]) == (0, 0)


def test_as_of_is_not_before_the_day_it_describes(sql):
    """A figure for 31 Oct can't have been fetched before 31 Oct."""
    early = sql("SELECT hospital_code, report_date, as_of FROM marts.fct_ed_daily "
                "WHERE CAST(as_of AS DATE) < report_date")
    assert early.empty, early.head().to_dict("records")


def test_is_complete_week_agrees_with_the_days_actually_present(sql):
    wrong = sql("""
        WITH c AS (SELECT hospital_code, iso_year, iso_week, count(median_wait_hours) w, count(attendances) a,
                          bool_and(is_complete_week) all_true, bool_or(is_complete_week) any_true
                   FROM marts.fct_ed_daily GROUP BY 1, 2, 3)
        SELECT * FROM c WHERE (w = 7 AND a = 7) <> all_true OR all_true <> any_true""")
    assert wrong.empty, wrong.head().to_dict("records")


def test_dq_flags_name_real_checks(sql, docs):
    documented = set(re.findall(r"^### `([a-z_.0-9]+)`", (docs / "data_quality.md").read_text(), re.M))
    flags = sql("SELECT DISTINCT unnest(string_split(dq_flags, ',')) f FROM marts.fct_ed_daily WHERE dq_flags IS NOT NULL")
    assert set(flags["f"]) <= documented, set(flags["f"]) - documented


def test_flagged_days_really_have_the_flagged_property(sql):
    """A '>24 h' badge on a value of 5 h would be a visible error."""
    wrong = sql("""SELECT hospital_code, report_date, median_wait_hours FROM marts.fct_ed_daily
                   WHERE contains(dq_flags, 'range.bed_wait_over_24h') AND NOT median_wait_hours > 24""")
    missing = sql("""SELECT hospital_code, report_date, median_wait_hours FROM marts.fct_ed_daily
                     WHERE median_wait_hours > 24 AND (dq_flags IS NULL OR NOT contains(dq_flags, 'range.bed_wait_over_24h'))""")
    assert wrong.empty and missing.empty, (wrong.head().to_dict("records"), missing.head().to_dict("records"))


# =========================================================================== #
# Weekly view (fct_ed_weekly)
# =========================================================================== #

def test_one_row_per_hospital_per_iso_week(sql):
    w = sql("SELECT hospital_code, iso_year, iso_week FROM marts.fct_ed_weekly")
    assert dupes(w, ["hospital_code", "iso_year", "iso_week"]).empty


def test_week_labels_are_real_iso_weeks(sql):
    w = sql("SELECT DISTINCT iso_year, iso_week, week_start, week_end FROM marts.fct_ed_weekly")
    for r in w.itertuples():
        start = pd.Timestamp(r.week_start).date()
        assert start.weekday() == 0, f"{start} is not a Monday"
        assert pd.Timestamp(r.week_end).date() - start == timedelta(days=6)
        assert start.isocalendar()[:2] == (r.iso_year, r.iso_week)


def test_every_week_matches_a_recomputation_from_the_daily_rows(sql):
    """All weeks, not one: the weekly chart must agree with the daily chart under it."""
    d = sql("SELECT hospital_code, report_date, median_wait_hours, attendances FROM marts.fct_ed_daily")
    iso = pd.to_datetime(d["report_date"]).dt.isocalendar()
    d["iso_year"], d["iso_week"] = iso["year"].astype(int), iso["week"].astype(int)
    hand = d.groupby(["hospital_code", "iso_year", "iso_week"]).agg(
        mean_w=("median_wait_hours", "mean"), sum_a=("attendances", lambda s: s.sum(min_count=1)),
        n_w=("median_wait_hours", "count"), n_a=("attendances", "count")).reset_index()
    w = sql("SELECT * FROM marts.fct_ed_weekly")
    m = hand.merge(w, on=["hospital_code", "iso_year", "iso_week"], how="outer", indicator=True)
    assert (m["_merge"] == "both").all(), m[m["_merge"] != "both"].head().to_dict("records")
    assert ((m["mean_w"] - m["mean_of_daily_median_wait_hours"]).abs().fillna(0) < 1e-9).all()
    assert (m["sum_a"].fillna(-1) == m["total_attendances"].fillna(-1)).all()
    assert (m["n_w"] == m["days_reported_wait"]).all() and (m["n_a"] == m["days_reported_attendances"]).all()


def test_incomplete_weeks_only_at_the_edges_of_a_series(sql):
    """A partial week in the middle of a series means missing data the chart would hide."""
    w = sql("SELECT hospital_code, week_start, is_complete_week FROM marts.fct_ed_weekly ORDER BY 1, 2")
    bad = []
    for code, g in w.groupby("hospital_code"):
        inner = g.iloc[1:-1]
        bad += [(code, str(pd.Timestamp(s).date())) for s in inner.loc[~inner["is_complete_week"], "week_start"]]
    assert not bad, bad[:10]


def test_partial_edge_weeks_are_marked_incomplete(sql):
    edge = sql("""SELECT hospital_code, iso_year, iso_week, days_reported_wait, is_complete_week
                  FROM marts.fct_ed_weekly WHERE days_reported_wait < 7 OR days_reported_attendances < 7""")
    assert not edge["is_complete_week"].any()


# =========================================================================== #
# Clinic access map (dim_clinic)
# =========================================================================== #

def test_one_row_per_clinic(sql):
    c = sql("SELECT clinic_key FROM marts.dim_clinic")
    assert c["clinic_key"].is_unique


def test_every_clinic_can_be_placed_on_a_map_of_singapore(sql):
    off = sql(f"""SELECT clinic_key, clinic_name, latitude, longitude FROM marts.dim_clinic
                  WHERE latitude IS NULL OR longitude IS NULL
                     OR NOT latitude BETWEEN {SG_LAT[0]} AND {SG_LAT[1]}
                     OR NOT longitude BETWEEN {SG_LON[0]} AND {SG_LON[1]}""")
    assert off.empty, off.to_dict("records")


def test_cdmp_flag_agrees_with_the_programme_list(sql):
    wrong = sql("""SELECT clinic_key, programmes, has_cdmp FROM marts.dim_clinic
                   WHERE has_cdmp IS DISTINCT FROM (programmes IS NOT NULL AND contains(upper(programmes), 'CDMP'))""")
    assert wrong.empty, wrong.head().to_dict("records")


def test_clinic_names_and_addresses_display_cleanly(sql):
    """Map popups show these verbatim: no stray whitespace, doubled symbols or empty strings."""
    c = sql("SELECT clinic_key, clinic_name, address FROM marts.dim_clinic")
    issues = []
    for col in ("clinic_name", "address"):
        s = c[col].fillna("")
        for label, mask in [("empty", s.str.strip() == ""), ("edge whitespace", s != s.str.strip()),
                            ("double space", s.str.contains("  ")), ("doubled #", s.str.contains("##"))]:
            if mask.any():
                issues.append(f"{col}: {int(mask.sum())} with {label}, e.g. {c.loc[mask, col].head(2).tolist()}")
    assert not issues, issues


def test_postal_codes_are_six_digits(sql):
    bad = sql("SELECT clinic_key, postal_code FROM marts.dim_clinic WHERE NOT regexp_full_match(coalesce(postal_code, ''), '[0-9]{6}')")
    assert bad.empty, bad.head().to_dict("records")


def test_clinic_as_of_is_the_publishers_date_and_says_so(sql):
    c = sql("SELECT DISTINCT as_of, as_of_basis, fetched_at FROM marts.dim_clinic")
    assert set(c["as_of_basis"]) == {"source_updated"}
    assert (c["as_of"] <= c["fetched_at"]).all()


def test_map_has_active_clinics(sql):
    n = sql("SELECT count(*) n FROM marts.dim_clinic WHERE is_active")["n"][0]
    assert n >= 1000, f"only {n} active clinics"


def test_clinic_access_page_has_its_65plus_population_denominator(sql):
    """The 'clinics per 1,000 residents aged 65+' page needs population by planning area."""
    n = sql("SELECT count(*) n FROM marts.fct_planning_area_population")["n"][0]
    assert n > 0, "fct_planning_area_population is empty: the clinic-access page has no denominator"


# =========================================================================== #
# Clinic access page: population denominator (fct_planning_area_population)
# =========================================================================== #

def test_one_row_per_planning_area_per_year_covering_all_55_areas(sql):
    pop = sql("SELECT planning_area, year FROM marts.fct_planning_area_population")
    assert dupes(pop, ["planning_area", "year"]).empty
    per_year = pop.groupby("year")["planning_area"].nunique()
    assert (per_year == 55).all(), per_year.to_dict()


def test_national_totals_are_plausible_for_singapore(sql):
    """Singapore has a little over 4 million residents, about a fifth aged 65+ (a super-aged society)."""
    t = sql("""SELECT year, sum(residents_total) total, sum(residents_65plus) aged
               FROM marts.fct_planning_area_population GROUP BY 1""")
    for r in t.itertuples():
        assert 3_800_000 <= r.total <= 4_800_000, (r.year, r.total)
        assert 0.15 <= r.aged / r.total <= 0.30, (r.year, r.aged / r.total)


def test_population_shares_are_valid_and_missing_only_where_nobody_lives(sql):
    pop = sql("SELECT planning_area, residents_total, residents_65plus, share_65plus FROM marts.fct_planning_area_population")
    assert (pop["residents_65plus"] <= pop["residents_total"]).all() and (pop["residents_65plus"] >= 0).all()
    assert pop["share_65plus"].dropna().between(0, 1).all()
    assert (pop["share_65plus"].isna() == (pop["residents_total"] == 0)).all()


def test_population_share_is_the_ratio_of_its_own_counts(sql):
    """The map shades by share_65plus and the tooltip shows the counts: they must agree."""
    off = sql("""SELECT planning_area, residents_total, residents_65plus, share_65plus FROM marts.fct_planning_area_population
                 WHERE residents_total > 0 AND abs(share_65plus - residents_65plus / residents_total) > 1e-12""")
    assert off.empty, off.to_dict("records")


def test_population_is_dated_by_its_reference_period(sql):
    pop = sql("SELECT DISTINCT year, reference_date, as_of, as_of_basis FROM marts.fct_planning_area_population")
    for r in pop.itertuples():
        assert pd.Timestamp(r.reference_date) == pd.Timestamp(f"{r.year}-06-30") == pd.Timestamp(r.as_of)
    assert set(pop["as_of_basis"]) == {"reference_period"}


def test_planning_areas_with_clinics_have_residents(sql):
    """A clinic-access ratio needs a denominator wherever there are clinics. Placeholder until clinics
    are assigned to planning areas: the population side must at least cover the residential areas."""
    residential = sql("SELECT count(*) n FROM marts.fct_planning_area_population WHERE residents_total > 0")["n"][0]
    assert residential >= 40, f"only {residential} planning areas with residents"


# =========================================================================== #
# Live waits widget (fct_live_ed_snapshot)
# =========================================================================== #

def test_every_live_reading_is_tied_to_a_hospital(sql):
    orphan = sql("SELECT site_name, department FROM marts.fct_live_ed_snapshot WHERE hospital_code IS NULL")
    assert orphan.empty, orphan.to_dict("records")


def test_live_readings_are_labelled_estimates(sql):
    assert set(sql("SELECT DISTINCT measure_type m FROM marts.fct_live_ed_snapshot")["m"]) == {"estimate"}


def test_one_live_reading_per_hospital_department_and_time(sql):
    l = sql("SELECT hospital_code, department, snapshot_at FROM marts.fct_live_ed_snapshot")
    assert dupes(l, ["hospital_code", "department", "snapshot_at"]).empty


def test_widget_filtering_adult_eds_gets_one_figure_per_hospital(sql):
    """The widget shows one figure per hospital, matching MOH's coverage (NUH = adults): filter is_adult_ed."""
    l = sql("""SELECT hospital_code, snapshot_at, count(*) n FROM marts.fct_live_ed_snapshot
               WHERE is_adult_ed GROUP BY 1, 2 HAVING count(*) > 1""")
    assert l.empty, l.to_dict("records")


def test_every_live_reading_is_classified_adult_or_children(sql):
    """If a section is neither, the adult filter would silently hide it: it must be caught, not dropped."""
    unknown = sql("SELECT site_name, department FROM marts.fct_live_ed_snapshot WHERE is_adult_ed IS NULL")
    assert unknown.empty, unknown.to_dict("records")


def test_every_hospital_in_the_live_widget_has_an_adult_reading(sql):
    missing = sql("""SELECT DISTINCT hospital_code FROM marts.fct_live_ed_snapshot
                     WHERE hospital_code NOT IN (SELECT hospital_code FROM marts.fct_live_ed_snapshot WHERE is_adult_ed)""")
    assert missing.empty, list(missing["hospital_code"])


def test_live_figures_are_plausible(sql):
    l = sql("SELECT * FROM marts.fct_live_ed_snapshot")
    assert (l["patients_waiting"].dropna() >= 0).all()
    for col in ("est_wait_to_see_doctor_hours", "est_bed_wait_hours"):
        assert l[col].dropna().between(0, 72).all(), col


def test_live_page_was_recent_when_fetched(sql):
    """'Live' means the page's own timestamp was close to when we read it."""
    l = sql("SELECT as_of, fetched_at, as_of_basis FROM marts.fct_live_ed_snapshot")
    lag = (l["fetched_at"] - l["as_of"]).dt.total_seconds() / 3600
    assert (lag >= 0).all() and (lag <= 3).all(), f"page lag at fetch: {lag.round(2).tolist()} h"


# =========================================================================== #
# Clinic access page (fct_area_access) and metric labels (dim_metric)
# =========================================================================== #

def test_access_page_has_every_planning_area_once(sql):
    a = sql("SELECT planning_area_code, planning_area FROM marts.fct_area_access")
    assert len(a) == 55 and a["planning_area_code"].is_unique and a["planning_area"].is_unique


def test_every_active_clinic_is_on_the_access_page_exactly_once(sql):
    """The map's clinic dots and the area totals must add up to the same number."""
    placed = sql("SELECT count(*) n FROM marts.dim_clinic WHERE is_active AND planning_area_code IS NOT NULL")["n"][0]
    active = sql("SELECT count(*) n FROM marts.dim_clinic WHERE is_active")["n"][0]
    counted = sql("SELECT sum(chas_clinics) n FROM marts.fct_area_access")["n"][0]
    assert placed == active, f"{active - placed} active clinics have no planning area"
    assert counted == placed


def test_access_ratios_are_the_ratio_of_their_own_counts(sql):
    off = sql("""SELECT planning_area FROM marts.fct_area_access WHERE residents_65plus > 0 AND (
                   abs(cdmp_clinics_per_1k_seniors - 1000.0 * cdmp_clinics / residents_65plus) > 1e-9
                OR abs(clinics_per_1k_seniors - 1000.0 * chas_clinics / residents_65plus) > 1e-9)""")
    assert off.empty, list(off["planning_area"])


def test_access_ratio_is_missing_only_where_no_one_aged_65_lives(sql):
    a = sql("SELECT residents_65plus, cdmp_clinics_per_1k_seniors r FROM marts.fct_area_access")
    assert (a["r"].isna() == (a["residents_65plus"] == 0)).all()
    assert (a["r"].dropna() >= 0).all()


def test_cdmp_clinics_are_a_subset_of_chas_clinics_in_every_area(sql):
    bad = sql("SELECT planning_area FROM marts.fct_area_access WHERE cdmp_clinics > chas_clinics")
    assert bad.empty, list(bad["planning_area"])


def test_access_page_population_matches_the_population_mart(sql):
    off = sql("""SELECT a.planning_area FROM marts.fct_area_access a JOIN marts.fct_planning_area_population p
                 ON p.planning_area = a.planning_area AND p.year = a.population_year
                 WHERE p.residents_65plus <> a.residents_65plus OR p.residents_total <> a.residents_total""")
    assert off.empty, list(off["planning_area"])


def test_access_as_of_is_never_newer_than_either_input(sql):
    a = sql("SELECT as_of, clinics_as_of, population_as_of FROM marts.fct_area_access")
    assert (a["as_of"] <= a["clinics_as_of"]).all() and (a["as_of"] <= a["population_as_of"]).all()


def test_clinic_and_population_names_agree(sql):
    """The map popup (dim_clinic) and the area panel (fct_area_access) must use the same area name."""
    off = sql("""SELECT DISTINCT c.planning_area FROM marts.dim_clinic c
                 WHERE c.planning_area IS NOT NULL AND c.planning_area NOT IN (SELECT planning_area FROM marts.fct_area_access)""")
    assert off.empty, list(off["planning_area"])


def test_every_metric_shown_has_a_label_unit_and_caveat(sql):
    m = sql("SELECT * FROM marts.dim_metric")
    for col in ("label", "definition", "unit", "unit_basis", "caveat", "source_name"):
        assert m[col].notna().all() and (m[col].str.strip() != "").all(), col
    for metric_id in m["metric_id"]:
        mart, col = metric_id.split(".")
        assert col in sql(f"SELECT * FROM marts.{mart} LIMIT 0").columns, metric_id


def test_inferred_units_say_so_in_their_caveat(sql):
    """Decision: publish bed waits with the caveat that the unit is inferred."""
    inferred = sql("SELECT metric_id, caveat FROM marts.dim_metric WHERE unit_basis = 'inferred'")
    assert "fct_ed_daily.median_wait_hours" in set(inferred["metric_id"])
    assert inferred["caveat"].str.contains("inferred", case=False).all()


# =========================================================================== #
# Web map layer (data/build/web/planning_area_access.geojson)
# =========================================================================== #

import json  # noqa: E402

from conftest import DB  # noqa: E402

WEB = DB.parent / "web" / "planning_area_access.geojson"


@pytest.fixture(scope="module")
def web_layer():
    if not WEB.exists():
        pytest.skip(f"no web layer at {WEB}")
    return json.loads(WEB.read_text())


def test_web_layer_is_under_1_mb():
    assert WEB.stat().st_size < 1_000_000, f"{WEB.stat().st_size:,} bytes"


def test_web_layer_has_every_planning_area_once_with_valid_geometry(web_layer, sql):
    from shapely.geometry import shape
    codes = [f["properties"]["planning_area_code"] for f in web_layer["features"]]
    expected = set(sql("SELECT planning_area_code FROM marts.fct_area_access")["planning_area_code"])
    assert len(codes) == len(set(codes)) == 55 and set(codes) == expected
    bad = [f["properties"]["planning_area"] for f in web_layer["features"]
           if not shape(f["geometry"]).is_valid or shape(f["geometry"]).is_empty]
    assert not bad, bad


def test_web_layer_properties_are_the_mart_values(web_layer, sql):
    import math
    mart = sql("SELECT * FROM marts.fct_area_access").set_index("planning_area_code")
    off = []
    for f in web_layer["features"]:
        p = f["properties"]; m = mart.loc[p["planning_area_code"]]
        for k in ("residents_65plus", "cdmp_clinics", "cdmp_clinics_per_1k_seniors", "pct_area_within_1km_of_cdmp",
                  "approx_km_centroid_to_nearest_polyclinic"):
            mv, pv = m[k], p[k]
            mnull = mv is None or (isinstance(mv, float) and math.isnan(mv))
            if mnull != (pv is None) or (not mnull and abs(float(mv) - pv) > 1e-4):
                off.append((p["planning_area"], k, mv, pv))
    assert not off, off[:5]


def test_web_layer_neighbours_do_not_gap_or_overlap(web_layer, sql):
    """Simplification must not open visible gaps or overlaps between areas (allowance: 1,000 m2 in total)."""
    import geopandas as gpd
    from shapely.geometry import Polygon, shape
    w = gpd.GeoSeries([shape(f["geometry"]) for f in web_layer["features"]], crs=4326).to_crs(3414)
    o = sql("SELECT geometry_wkt FROM main.planning_area_boundaries")
    o = gpd.GeoSeries.from_wkt(o["geometry_wkt"], crs=4326).to_crs(3414)
    holes = lambda g: sum(Polygon(r).area for p in getattr(g.union_all(), "geoms", [g.union_all()]) for r in p.interiors)
    assert w.area.sum() - w.union_all().area < 1000, "overlap between neighbours"
    assert holes(w) - holes(o) < 1000, "new gaps between neighbours"
    assert abs(w.area.sum() / o.area.sum() - 1) < 0.001


def test_every_area_note_shown_on_the_map_comes_from_the_mart(web_layer, sql):
    notes = sql("SELECT planning_area_code, dq_note FROM marts.fct_area_access").set_index("planning_area_code")["dq_note"]
    for f in web_layer["features"]:
        m = notes.loc[f["properties"]["planning_area_code"]]
        assert (f["properties"]["dq_note"] or None) == (m if isinstance(m, str) else None)
