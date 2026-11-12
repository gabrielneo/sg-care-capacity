"""A small snapshot, laid out exactly like `sg-health publish` output, built at test time.

CI refuses committed .duckdb/.parquet files, so it is generated. Its mart columns are checked
against docs/data_dictionary.md (test_fixture_matches_the_data_dictionary), which the pipeline's
own tests check against the real marts, so the fixture can't drift from what the API will read.

What's in it, and why:
- SGH: 24 Aug to 31 Oct 2026 (8 complete weeks before the latest complete one, as the site's usual level needs). The last ISO week (26 Oct) has 6 of 7 days, as in real MOH data.
  The latest complete week (19 Oct) has higher waits and attendances than the 4 weeks before.
- AH (a UCC): one missing attendance day on 7 Oct, so 5 Oct is an incomplete week and the
  4-week baseline for AH can't be computed.
- NUH: in dim_hospital but no daily rows (missing stays missing).
- Clinics: CDMP, non-CDMP, unknown programme (NULL), and an inactive clinic.
- Live: two NUHS snapshots; NTFGH appears only in the older one.
- dq_results: an old run and the latest run; only the latest may be served.
"""
from __future__ import annotations

import hashlib
import json
from datetime import date, datetime, timedelta
from pathlib import Path

import duckdb

SNAPSHOT_ID = "data-2026-11-01"
CREATED_AT = "2026-11-01T16:34:48"
FIRST_DAY, LAST_DAY = date(2026, 8, 24), date(2026, 10, 31)
MOH_FETCHED = datetime(2026, 11, 1, 16, 33, 44)

INSIGHT_EXTRA_DDL = """, display STRUCT(value_text VARCHAR, unit_text VARCHAR, metric_label VARCHAR,
        comparison_label VARCHAR, change VARCHAR, change_word VARCHAR),
    chart STRUCT(kind VARCHAR, y_label VARCHAR, x_label VARCHAR, points STRUCT("key" VARCHAR, label VARCHAR, value DOUBLE)[],
        highlight VARCHAR[], callout VARCHAR, reference STRUCT(value DOUBLE, label VARCHAR),
        trend_line STRUCT(first DOUBLE, last DOUBLE))"""

DDL = {
    "dim_hospital": """hospital_code VARCHAR, hospital_name VARCHAR, cluster VARCHAR, facility_type VARCHAR,
        reported_from DATE, coverage_note VARCHAR, exclusions_note VARCHAR, postal_code VARCHAR, latitude DOUBLE,
        longitude DOUBLE, location_source_url VARCHAR, location_checked DATE, source_url VARCHAR, source_sha256 VARCHAR,
        as_of DATE, as_of_basis VARCHAR""",
    "dim_polyclinic": """polyclinic_name VARCHAR, address VARCHAR, postal_code VARCHAR, latitude DOUBLE, longitude DOUBLE,
        source_url VARCHAR, source_sha256 VARCHAR, fetched_at TIMESTAMP, as_of TIMESTAMP, as_of_basis VARCHAR""",
    "fct_ed_daily": """hospital_code VARCHAR, hospital_name VARCHAR, report_date DATE, iso_year INTEGER, iso_week INTEGER,
        median_wait_hours DOUBLE, attendances BIGINT, is_complete_week BOOLEAN, dq_flags VARCHAR,
        wait_source_url VARCHAR, wait_source_sha256 VARCHAR, attendance_source_url VARCHAR,
        attendance_source_sha256 VARCHAR, as_of TIMESTAMP, as_of_basis VARCHAR""",
    "fct_ed_weekly": """hospital_code VARCHAR, hospital_name VARCHAR, iso_year INTEGER, iso_week INTEGER, week_start DATE,
        week_end DATE, mean_of_daily_median_wait_hours DOUBLE, total_attendances BIGINT, days_reported_wait INTEGER,
        days_reported_attendances INTEGER, is_complete_week BOOLEAN, source_sha256 VARCHAR, as_of TIMESTAMP,
        as_of_basis VARCHAR""",
    "dim_clinic": """clinic_key VARCHAR, hci_code VARCHAR, clinic_name VARCHAR, address VARCHAR, postal_code VARCHAR,
        latitude DOUBLE, longitude DOUBLE, programmes VARCHAR, has_cdmp BOOLEAN, is_active BOOLEAN,
        planning_area_code VARCHAR, planning_area VARCHAR, planning_area_assignment VARCHAR, source_url VARCHAR,
        source_sha256 VARCHAR, fetched_at TIMESTAMP, as_of TIMESTAMP, as_of_basis VARCHAR""",
    "fct_live_ed_snapshot": """hospital_code VARCHAR, site_name VARCHAR, department VARCHAR, is_adult_ed BOOLEAN,
        measure_type VARCHAR, patients_waiting INTEGER, est_wait_to_see_doctor_hours DOUBLE, est_bed_wait_hours DOUBLE,
        est_wait_to_see_doctor_qualifier VARCHAR, est_bed_wait_qualifier VARCHAR, snapshot_at TIMESTAMP, source_updated_at TIMESTAMP, source_url VARCHAR, source_sha256 VARCHAR,
        fetched_at TIMESTAMP, as_of TIMESTAMP, as_of_basis VARCHAR""",
    "fct_planning_area_population": """planning_area VARCHAR, year INTEGER, residents_total BIGINT,
        residents_65plus BIGINT, share_65plus DOUBLE, reference_date DATE, source_table VARCHAR, source_url VARCHAR,
        source_sha256 VARCHAR, fetched_at TIMESTAMP, as_of TIMESTAMP, as_of_basis VARCHAR""",
    "fct_area_access": """planning_area_code VARCHAR, planning_area VARCHAR, region_name VARCHAR, population_year INTEGER,
        residents_total BIGINT, residents_65plus BIGINT, chas_clinics BIGINT, cdmp_clinics BIGINT,
        clinics_per_1k_seniors DOUBLE, cdmp_clinics_per_1k_seniors DOUBLE, area_km2 DOUBLE,
        pct_area_within_1km_of_cdmp DOUBLE, approx_km_centroid_to_nearest_polyclinic DOUBLE, nearest_polyclinic VARCHAR,
        centroid_in_area BOOLEAN, dq_note VARCHAR, clinics_as_of TIMESTAMP, population_as_of TIMESTAMP,
        clinic_source_sha256 VARCHAR, population_source_sha256 VARCHAR, boundary_source_sha256 VARCHAR,
        polyclinic_source_sha256 VARCHAR, as_of TIMESTAMP, as_of_basis VARCHAR""",
    "dim_metric": """metric_id VARCHAR, label VARCHAR, definition VARCHAR, unit VARCHAR, unit_basis VARCHAR,
        caveat VARCHAR, source_name VARCHAR, source_sha256 VARCHAR, as_of DATE, as_of_basis VARCHAR""",
    "fct_insight": """insight_id VARCHAR, type VARCHAR, entity VARCHAR, headline VARCHAR, detail VARCHAR, metric_value DOUBLE,
        unit VARCHAR, comparison_value DOUBLE, direction VARCHAR, effect_size DOUBLE, p_value DOUBLE, p_adjusted DOUBLE,
        n INTEGER, method VARCHAR, caveats VARCHAR[], who_acts VARCHAR, action VARCHAR,
        evidence STRUCT(endpoint VARCHAR, query VARCHAR), as_of DATE, as_of_basis VARCHAR, rank_score DOUBLE,
        headline_rank INTEGER, period_start DATE, period_end DATE, strength VARCHAR""" + INSIGHT_EXTRA_DDL,
}

WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def _display(value: str, unit: str | None, label: str, comparison: str | None, change: str | None, word: str | None) -> dict:
    return {"value_text": value, "unit_text": unit, "metric_label": label, "comparison_label": comparison,
            "change": change, "change_word": word}


def _chart(kind: str, y_label: str, points: list[tuple[str, str, float | None]], highlight: list[str], callout: str,
           reference: tuple[float, str] | None, x_label: str | None = None) -> dict:
    return {"kind": kind, "y_label": y_label, "x_label": x_label,
            "points": [{"key": k, "label": lab, "value": v} for k, lab, v in points], "highlight": highlight,
            "callout": callout, "reference": None if reference is None else {"value": reference[0], "label": reference[1]},
            "trend_line": None}


def _weekday_chart(values: list[float], peak: str, mean: float, callout: str) -> dict:
    return _chart("bar", "Hours, average of the daily medians on that weekday",
                  [(d.lower(), d, v) for d, v in zip(WEEKDAY_LABELS, values, strict=True)], [peak], callout, (mean, "Weekly average"))


ANOMALY_WEEKS = [date(2026, 8, 24) + timedelta(weeks=k) for k in range(9)]

# Five published insights. The headline findings are one per detector type (ranks 1-3); one more weekday, one access gap.
INSIGHTS = [
    ("weekday-aaaaaaaaaa", "weekday", "SGH", "At Singapore General Hospital, bed waits are longest on Mondays, 25% above its weekly average.",
     "Waits differ by day of the week over 6 complete weeks. This is unlikely to be chance: the odds are about 4 in 1,000, allowing for every test run.",
     5.0, "hours", 4.0, "neutral", 0.21, 0.001, 0.004, 42, "Kruskal-Wallis test across weekdays; epsilon-squared",
     ["The test shows that weekdays differ; the peak day is the one with the highest average."], None, None,
     {"endpoint": "/api/v1/ed/daily?hospital=SGH", "query": "SELECT 1"}, date(2026, 10, 25), "latest_data", 0.95, 1,
     _display("5.0", "hours", "Average of daily median bed waits on Mondays", "4.0 hours, its weekly average", "up", "higher than average"),
     _weekday_chart([5.0, 4.1, 3.9, 3.8, 3.9, 3.7, 3.6], "mon", 4.0, "Mondays: 25% above average")),
    ("anomaly-bbbbbbbbbb", "anomaly", "SGH", "Bed waits at Singapore General Hospital were unusually long in the week of 19–25 Oct 2026: 5.0 hours.",
     "The usual level over the 8 weeks before was 4.0 hours. A week this far out happens rarely by chance.",
     5.0, "hours", 4.0, "worse", 4.2, None, None, 9, "Robust z-score (median and MAD of the 8 weeks before)",
     ["One unusual week is not a trend."], None, None,
     {"endpoint": "/api/v1/ed/weekly?hospital=SGH&weeks=9", "query": "SELECT 2"}, date(2026, 10, 25), "latest_data", 0.6, 2,
     _display("5.0", "hours", "Average of daily median bed waits, week of 19–25 Oct 2026", "4.0 hours, usual for this hospital", "up",
              "higher than usual"),
     _chart("line", "Hours, average of each day's median",
            [(w.isoformat(), f"{w.day} {w.strftime('%b')}", v)
             for w, v in zip(ANOMALY_WEEKS, [3.9, 4.1, 4.0, 3.8, 4.2, 4.0, 3.9, 4.1, 5.0], strict=True)],
            ["2026-10-19"], "19–25 Oct 2026: 5.0 hours", (4.0, "Usual level"))),
    ("volume_vs_wait-dddddddddd", "volume_vs_wait", "NUH",
     "At National University Hospital, bed waits move moderately with ED visits the day before.",
     "Busier days come with longer bed waits, over 40 days after removing the usual weekday pattern. It is an association only.",
     0.42, "Spearman correlation", None, "neutral", 0.42, 0.001, 0.006, 40,
     "Spearman correlation, visits on day t vs bed wait on day t+1, after removing each weekday's median",
     ["This is an association only; it does not show why waits move.", "The link is moderate (Spearman correlation 0.42).",
      "MOH's figures for this hospital cover adults only."], None, None,
     {"endpoint": "/api/v1/ed/daily?hospital=NUH&from=2026-09-14&to=2026-10-25", "query": "SELECT 4"},
     date(2026, 10, 25), "latest_data", 0.4, 3,
     _display("0.42", None, "Correlation of ED visits with the bed wait the day after", None, None, "moderate link"),
     _chart("bar", "Bed wait the day after, hours vs usual for that weekday",
            [("q1", "Quietest", -0.6), ("q2", "Quieter", -0.2), ("q3", "Middle", 0.0), ("q4", "Busier", 0.3),
             ("q5", "Busiest", 0.5)], ["q5"], "After the busiest days: 1.1 hours longer than after the quietest",
            (0.0, "Usual for that weekday"), x_label="Days in five equal groups by ED visits vs usual")),
    ("weekday-cccccccccc", "weekday", "AH", "At Alexandra Hospital, bed waits are longest on Tuesdays, 10% above its weekly average.",
     "Waits differ by day of the week over 5 complete weeks. This is unlikely to be chance: the odds are about 3 in 100, allowing for every test run.",
     2.2, "hours", 2.0, "neutral", 0.05, 0.01, 0.03, 35, "Kruskal-Wallis test across weekdays; epsilon-squared",
     ["Alexandra Hospital runs an urgent care centre, not a full emergency department."], None, None,
     {"endpoint": "/api/v1/ed/daily?hospital=AH", "query": "SELECT 3"}, date(2026, 10, 25), "latest_data", 0.3, None,
     _display("2.2", "hours", "Average of daily median bed waits on Tuesdays", "2.0 hours, its weekly average", "up", "higher than average"),
     _weekday_chart([2.0, 2.2, 2.0, 1.9, 2.0, 1.9, 2.0], "tue", 2.0, "Tuesdays: 10% above average")),
    # Bedok: 1 CDMP clinic for 61,000 seniors; the national rate (2 clinics / 61,000) would give it 2.
    ("access_gap-eeeeeeeeee", "access_gap", "Bedok",
     "Bedok has about 1 fewer CDMP GP clinic than the national rate would give its seniors.",
     "It has 1 clinic for 61,000 residents aged 65+, where the national rate suggests 2. Clinics are counted where they are, not where patients go.",
     0.0164, "CDMP GP clinics per 1,000 residents aged 65+", 0.0328, "worse", 0.25, None, None, 61000,
     "Expected CDMP clinics at the national rate per senior; priority = seniors percentile x (1 - access percentile)",
     ["The clinic list dates from June 2024 and residents from June 2026."], None, None,
     {"endpoint": "/api/v1/areas/access", "query": "SELECT 5"}, date(2024, 6, 6), "source_updated", 0.1, None,
     _display("0.02", "per 1,000 residents aged 65+", "CDMP GP clinics per 1,000 residents aged 65+ in Bedok",
              "0.03, the national rate", "down", "lower than the national rate"),
     _chart("bar", "CDMP GP clinics per 1,000 residents aged 65+", [("area", "Bedok", 0.0164), ("national", "Singapore overall", 0.0328)],
            ["area"], "About 1 clinic short of the national rate", None)),
]
# period_start, period_end and strength sit between headline_rank (column 22) and display (column 25).
_PERIOD = {"weekday": (date(2026, 4, 27), date(2026, 10, 25), "moderate"), "anomaly": (date(2026, 10, 19), date(2026, 10, 25), "strong"),
           "volume_vs_wait": (date(2026, 9, 14), date(2026, 10, 25), "moderate"),
           "access_gap": (date(2024, 6, 6), date(2024, 6, 6), "weak")}
INSIGHTS = [(*r[:22], *_PERIOD[r[1]], *r[22:]) for r in INSIGHTS]
DQ_DDL = """check_id VARCHAR, "table" VARCHAR, severity VARCHAR, status VARCHAR, failing_rows INTEGER,
    details VARCHAR, run_id VARCHAR, checked_at TIMESTAMP, scope VARCHAR, blocks_publish BOOLEAN"""

H = "a" * 64
MOH_URL = "https://www.moh.gov.sg/fixture.xlsx"
CHAS_AS_OF = datetime(2024, 6, 6, 14, 36, 42)
POP_AS_OF = datetime(2026, 6, 30)

ONEMAP, PIN_CHECKED = "https://www.onemap.gov.sg/api/common/elastic/search", date(2026, 11, 9)
HOSPITALS = [
    ("AH", "Alexandra Hospital (UCC)", "NUHS", "UCC", None, "Urgent Care Centre, not a full ED.",
     "Excludes KKH and NUH Children's Emergency.", "159964", 1.285481, 103.800181, ONEMAP, PIN_CHECKED,
     "https://www.moh.gov.sg/", H, date(2026, 11, 6), "reference_checked"),
    ("NUH", "National University Hospital", "NUHS", "ED", None, "Adults only.",
     "Excludes KKH and NUH Children's Emergency.", "119074", 1.294420, 103.783687, ONEMAP, PIN_CHECKED,
     "https://www.moh.gov.sg/", H, date(2026, 11, 6), "reference_checked"),
    ("SGH", "Singapore General Hospital", "SingHealth", "ED", None, None,
     "Excludes KKH and NUH Children's Emergency.", "169608", 1.278429, 103.834043, ONEMAP, PIN_CHECKED,
     "https://www.moh.gov.sg/", H, date(2026, 11, 6), "reference_checked"),
]
NAMES = {h[0]: h[1] for h in HOSPITALS}
POLY_AS_OF = datetime(2026, 1, 4, 10, 6, 46)
# Two polyclinics (name, address, postal code, lat, lon), in the order the mart sorts them.
POLYCLINICS = [
    ("Bedok Polyclinic", "11 Bedok North Street 1", "469662", 1.326, 103.932),
    ("Woodlands Polyclinic", "10 Woodlands Street 31", "738579", 1.431, 103.775),
]


def _daily_values(code: str, day: date) -> tuple[float | None, int | None, str | None]:
    week = day.isocalendar()[1]
    if code == "SGH":
        if week == 43:
            return 5.0, 450, "range.bed_wait_over_24h" if day == date(2026, 10, 20) else None
        if week == 44:
            return 4.5, 420, None
        return 4.0, 400, None
    if code == "AH":
        return 2.0, None if day == date(2026, 10, 7) else 100, None
    raise ValueError(code)


def daily_rows() -> list[tuple]:
    rows = []
    for code in ("AH", "SGH"):
        day = FIRST_DAY
        while day <= LAST_DAY:
            wait, att, flags = _daily_values(code, day)
            y, w, _ = day.isocalendar()
            rows.append((code, NAMES[code], day, y, w, wait, att, flags, MOH_URL if wait is not None else None,
                         H if wait is not None else None, MOH_URL if att is not None else None,
                         H if att is not None else None, MOH_FETCHED, "fetched"))
            day += timedelta(days=1)
    return rows


CLINICS = [
    ("C1", "HCI1", "Alpha Clinic", "1 Bedok North Ave", "460001", 1.3240, 103.9300, "CDMP,CHAS", True, True, "BD", "Bedok"),
    ("C2", "HCI2", "Bravo Clinic", "2 Bedok Rd", "460002", 1.3300, 103.9400, "CHAS", False, True, "BD", "Bedok"),
    ("C3", "HCI3", "Charlie Clinic", "3 Tuas Ave", "638003", 1.3200, 103.6500, "CDMP,CHAS", True, True, "TS", "Tuas"),
    ("C4", "HCI4", "Delta Clinic", "4 Bedok Walk", "460004", 1.3250, 103.9350, None, None, True, "BD", "Bedok"),
    ("C5", "HCI5", "Echo Clinic", "5 Bedok Closed", "460005", 1.3260, 103.9360, "CDMP,CHAS", True, False, "BD", "Bedok"),
]

LIVE = [   # (code, site, department, adult, waiting, doctor_h, bed_h, doctor_q, bed_q, snapshot_at)
    ("NTFGH", "Ng Teng Fong General Hospital", "Adult Emergency", True, 12, 1.0, 5.0, None, None, datetime(2026, 10, 31, 20, 0)),
    ("NUH", "National University Hospital", "Adult Emergency", True, 20, 2.0, 18.0, None, None, datetime(2026, 10, 31, 20, 0)),
    ("NUH", "National University Hospital", "Adult Emergency", True, 18, 2.0, 20.0, None, None, datetime(2026, 11, 1, 12, 1, 49)),
    ("NUH", "National University Hospital", "Children's Emergency", False, 2, 1.0, 1.0, None, "<", datetime(2026, 11, 1, 12, 1, 49)),
    # As NUHS published on 2026-11-08, "< 1 hour(s)": a bound, here for Alexandra's wait to see a doctor and
    # NUH Children's bed wait. (Alexandra's bed wait stays a value, so the NUHS-vs-MOH chart has a line.)
    ("AH", "Alexandra Hospital", "Adult Emergency", True, 4, 1.0, 1.0, "<", None, datetime(2026, 11, 1, 12, 1, 49)),
]

AREAS = [   # code, name, region, total, 65+, chas, cdmp, per1k, cdmp per1k, km2, pct1km, km_poly, poly, centroid_in, note
    ("BD", "Bedok", "EAST REGION", 276000, 61000, 3, 1, 0.0492, 0.0164, 21.69, 83.3, 0.75, "Bedok Polyclinic", True, None),
    ("TS", "Tuas", "WEST REGION", 0, 0, 1, 1, None, None, 30.0, 10.0, 6.1, "Pioneer Polyclinic", True,
     "no residents"),
]

METRICS = [
    ("fct_ed_daily.median_wait_hours", "Median wait for a ward bed (daily)", "Daily median wait.", "hours", "inferred",
     "Unit inferred, not stated by MOH.", "MOH, Waiting Time for Admission to Ward"),
    ("fct_ed_daily.attendances", "Emergency department attendances (daily)", "Attendances.", "patients", "stated",
     "Includes non-urgent cases.", "MOH, Attendances at Emergency Medicine Departments"),
    ("fct_ed_weekly.mean_of_daily_median_wait_hours", "Average of daily median ward-bed waits (week)", "Mean.", "hours",
     "inferred", "Not a weekly median.", "MOH, Waiting Time for Admission to Ward"),
    ("fct_area_access.cdmp_clinics_per_1k_seniors", "CDMP clinics per 1,000 residents aged 65+", "Ratio.",
     "clinics per 1,000 residents aged 65+", "stated", "Mixes vintages.", "data.gov.sg CHAS Clinics; SingStat"),
    ("fct_live_ed_snapshot.est_bed_wait_hours", "Estimated bed wait now (NUHS)", "Estimate.", "hours", "stated",
     "An estimate at one moment, not MOH's daily median.", "NUHS, Emergency Department wait times"),
]

LATEST_RUN = "run-latest"
DQ = [
    # check_id, table, severity, status, failing, details, run_id, checked_at, scope, blocks
    ("range.bed_wait_over_24h", "moh_bed_waits", "WARN", "fail", 9, "old run", "run-old",
     datetime(2026, 10, 25, 8), "row", False),
    ("range.bed_wait_over_24h", "moh_bed_waits", "WARN", "fail", 1, "SGH, 2026-10-20: over 24 hours", LATEST_RUN,
     datetime(2026, 11, 1, 16, 34), "row", False),
    ("clinic.coordinates_in_singapore", "chas_clinics", "ERROR", "fail", 1, "1 clinic outside Singapore, quarantined",
     LATEST_RUN, datetime(2026, 11, 1, 16, 34), "row", False),
    ("schema.types", "moh_bed_waits", "ERROR", "pass", 0, "", LATEST_RUN, datetime(2026, 11, 1, 16, 34), "file", True),
    ("freshness.population_15_months", "pop_65plus_by_area", "WARN", "pass", 0, "ok", LATEST_RUN,
     datetime(2026, 11, 1, 16, 34), "dataset", False),
    ("reconcile.nuhs_vs_moh_nuh", "nuhs_live_waits", "WARN", "skipped", 0, "no overlap", LATEST_RUN,
     datetime(2026, 11, 1, 16, 34), "dataset", False),
]


def _square(lon: float, lat: float, d: float = 0.01) -> dict:
    ring = [[lon, lat], [lon + d, lat], [lon + d, lat + d], [lon, lat + d], [lon, lat]]
    return {"type": "Polygon", "coordinates": [ring]}


# The national rate is all CDMP clinics over all residents aged 65+ (2 / 61,000): Bedok is 1 short;
# Tuas has no residents aged 65+, so it isn't ranked.
ACCESS_GAP = {"BD": (None, 1.0), "TS": ("no residents aged 65+", None)}
SVY21_ORIGIN = [29537, 33000]


def _area_properties(code, name, region, total, aged, chas, cdmp, per1k, cdmp1k, pct, km, poly, note) -> dict:
    reason, short = ACCESS_GAP[code]
    return {"planning_area_code": code, "planning_area": name, "region_name": region, "population_year": 2026,
            "residents_total": total, "residents_65plus": aged, "chas_clinics": chas, "cdmp_clinics": cdmp,
            "clinics_per_1k_seniors": per1k, "cdmp_clinics_per_1k_seniors": cdmp1k,
            "pct_area_within_1km_of_cdmp": pct, "approx_km_centroid_to_nearest_polyclinic": km,
            "nearest_polyclinic": poly, "dq_note": note, "as_of": CHAS_AS_OF.isoformat(),
            "as_of_basis": "source_updated", "excluded_reason": reason, "cdmp_shortfall": short}


def geojson() -> dict:
    features = []
    for (code, name, region, total, aged, chas, cdmp, per1k, cdmp1k, _km2, pct, km, poly, _cin, note), (lon, lat) in zip(
            AREAS, [(103.92, 1.32), (103.63, 1.31)], strict=True):
        features.append({"type": "Feature", "geometry": _square(lon, lat),
                         "properties": _area_properties(code, name, region, total, aged, chas, cdmp, per1k, cdmp1k, pct, km,
                                                        poly, note)})
    return {"type": "FeatureCollection", "metadata": {"title": "fixture", "methodology": "docs/methodology.md"},
            "features": features}


def geojson_svy21() -> dict:
    """The same two areas as squares in SVY21 metres around Singapore's centre (the 3D map layer)."""
    features = []
    for (code, name, region, total, aged, chas, cdmp, per1k, cdmp1k, _km2, pct, km, poly, _cin, note), (x, y) in zip(
            AREAS, [(9000, -1000), (-20000, -2000)], strict=True):
        ring = [[x, y], [x + 1000, y], [x + 1000, y + 1000], [x, y + 1000], [x, y]]
        props = _area_properties(code, name, region, total, aged, chas, cdmp, per1k, cdmp1k, pct, km, poly, note)
        features.append({"type": "Feature", "geometry": {"type": "Polygon", "coordinates": [ring]},
                         "properties": {**props, "label_x": x + 500, "label_y": y + 500}})
    return {"type": "FeatureCollection",
            "metadata": {"title": "fixture", "crs": "SVY21 (EPSG:3414), metres, translated", "origin": SVY21_ORIGIN},
            "features": features}


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build(out: Path, *, insights: bool = True, insight_charts: bool = True, svy21: bool = True,
          live_qualifiers: bool = True, places: bool = True) -> Path:
    """Write the fixture snapshot into `out` (created). Returns `out`.
    insights=False builds a release from before the insight engine (no fct_insight);
    insight_charts=False one from before it wrote display and chart; svy21=False one with no 3D map layer;
    live_qualifiers=False one from before NUHS bounds were kept (no *_qualifier columns);
    places=False one from before 2026-11-09 (no dim_polyclinic, no hospital pins)."""
    marts = {m: cols for m, cols in DDL.items() if (insights or m != "fct_insight") and (places or m != "dim_polyclinic")}
    if not insight_charts:
        marts["fct_insight"] = marts["fct_insight"].replace(INSIGHT_EXTRA_DDL, "")
    out.mkdir(parents=True, exist_ok=True)
    db = out / "analytics.duckdb"
    con = duckdb.connect(str(db))
    try:
        con.execute("CREATE SCHEMA marts")
        for mart, cols in marts.items():
            con.execute(f"CREATE TABLE marts.{mart} ({cols})")
        con.execute(f"CREATE TABLE main.dq_results ({DQ_DDL})")
        con.executemany("INSERT INTO marts.dim_hospital VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", HOSPITALS)
        if places:
            con.executemany("INSERT INTO marts.dim_polyclinic VALUES (?,?,?,?,?,?,?,?,?,'source_updated')",
                            [(*pc, "https://data.gov.sg/polyclinics.geojson", H, datetime(2026, 11, 1, 16, 34),
                              POLY_AS_OF) for pc in POLYCLINICS])
        else:
            for col in ("postal_code", "latitude", "longitude", "location_source_url", "location_checked"):
                con.execute(f"ALTER TABLE marts.dim_hospital DROP COLUMN {col}")
        con.executemany("INSERT INTO marts.fct_ed_daily VALUES (?,?,?,?,?,?,?,NULL,?,?,?,?,?,?,?)", daily_rows())
        # is_complete_week: all 7 days of both metrics in the hospital's ISO week (as the mart does).
        con.execute("""UPDATE marts.fct_ed_daily d SET is_complete_week = w.n = 7 FROM (
                         SELECT hospital_code, iso_year, iso_week,
                                count(*) FILTER (WHERE median_wait_hours IS NOT NULL AND attendances IS NOT NULL) AS n
                         FROM marts.fct_ed_daily GROUP BY ALL) w
                       WHERE d.hospital_code = w.hospital_code AND d.iso_year = w.iso_year AND d.iso_week = w.iso_week""")
        con.execute("""INSERT INTO marts.fct_ed_weekly
            SELECT hospital_code, hospital_name, iso_year, iso_week, date_trunc('week', min(report_date))::DATE,
                   (date_trunc('week', min(report_date)) + INTERVAL 6 DAY)::DATE, avg(median_wait_hours),
                   sum(attendances)::BIGINT, count(median_wait_hours)::INTEGER, count(attendances)::INTEGER,
                   count(median_wait_hours) = 7 AND count(attendances) = 7, string_agg(DISTINCT wait_source_sha256, ','),
                   max(as_of), 'fetched'
            FROM marts.fct_ed_daily GROUP BY hospital_code, hospital_name, iso_year, iso_week""")
        con.executemany("INSERT INTO marts.dim_clinic VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'inside',?,?,?,?,?)",
                        [(*c, "https://data.gov.sg/chas.geojson", H, datetime(2026, 11, 1, 16, 34), CHAS_AS_OF,
                          "source_updated") for c in CLINICS])
        con.executemany("INSERT INTO marts.fct_live_ed_snapshot VALUES (?,?,?,?,'estimate',?,?,?,?,?,?,?,?,?,?,?,?)",
                        [(code, site, dept, adult, n, doc, bed, doc_q, bed_q, at, at, "https://www.nuhs.edu.sg/wait", H,
                          at + timedelta(minutes=5), at, "source_updated")
                         for code, site, dept, adult, n, doc, bed, doc_q, bed_q, at in LIVE])
        if not live_qualifiers:
            for col in ("est_wait_to_see_doctor_qualifier", "est_bed_wait_qualifier"):
                con.execute(f"ALTER TABLE marts.fct_live_ed_snapshot DROP COLUMN {col}")
        con.executemany("INSERT INTO marts.fct_planning_area_population VALUES (?,2026,?,?,?,DATE '2026-06-30',"
                        "'respopagesextod2026',?,?,?,?,'reference_period')",
                        [(name, total, aged, (aged / total) if total else None, "https://www.singstat.gov.sg/x.zip", H,
                          datetime(2026, 11, 1, 16, 34), POP_AS_OF) for _, name, _, total, aged, *_ in AREAS])
        con.executemany("INSERT INTO marts.fct_area_access VALUES (?,?,?,2026,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,"
                        "'source_updated')",
                        [(*a, CHAS_AS_OF, POP_AS_OF, H, H, H, H, CHAS_AS_OF) for a in AREAS])
        con.executemany("INSERT INTO marts.dim_metric VALUES (?,?,?,?,?,?,?,?,DATE '2026-11-06','reference_checked')",
                        [(*m, H) for m in METRICS])
        con.executemany("INSERT INTO main.dq_results VALUES (?,?,?,?,?,?,?,?,?,?)", DQ)
        if insights:
            rows = INSIGHTS if insight_charts else [r[:25] for r in INSIGHTS]
            con.executemany(f"INSERT INTO marts.fct_insight VALUES ({', '.join('?' * len(rows[0]))})", rows)
        (out / "parquet").mkdir(exist_ok=True)
        for mart in marts:
            con.execute(f"COPY marts.{mart} TO '{out / 'parquet' / (mart + '.parquet')}' (FORMAT parquet)")
        row_counts = {m: con.execute(f"SELECT count(*) FROM marts.{m}").fetchall()[0][0] for m in marts}
        con.execute("CHECKPOINT")
    finally:
        con.close()
    (out / "planning_area_access.geojson").write_text(json.dumps(geojson()))
    layers = [out / "planning_area_access.geojson"]
    if svy21:
        (out / "planning_area_access_svy21.geojson").write_text(json.dumps(geojson_svy21()))
        layers.append(out / "planning_area_access_svy21.geojson")

    files = [db, *layers, *sorted((out / "parquet").glob("*.parquet"))]
    latest = [d for d in DQ if d[6] == LATEST_RUN]
    manifest = {
        "snapshot_id": SNAPSHOT_ID,
        "created_at": CREATED_AT,
        "pipeline_commit": "0" * 40,
        "row_counts": row_counts,
        "artefacts": {f.relative_to(out).as_posix(): {"sha256": _sha(f), "bytes": f.stat().st_size} for f in files},
        "sources": {
            "moh_bed_waits": {"as_of": "2026-10-31", "as_of_basis": "latest report_date",
                              "last_fetched_at": "2026-11-01T16:33:44"},
            "moh_ed_attendances": {"as_of": "2026-10-31", "as_of_basis": "latest report_date",
                                   "last_fetched_at": "2026-11-01T16:33:50"},
            "datagov_chas": {"as_of": CHAS_AS_OF.isoformat(), "as_of_basis": "data.gov.sg lastUpdatedAt",
                             "last_fetched_at": "2026-11-01T16:34:00"},
            "datagov_planning_areas": {"as_of": "2026-02-27T10:07:02", "as_of_basis": "data.gov.sg lastUpdatedAt",
                                       "last_fetched_at": "2026-11-01T16:34:17"},
            "datagov_polyclinics": {"as_of": "2026-01-04T10:06:46", "as_of_basis": "data.gov.sg lastUpdatedAt",
                                    "last_fetched_at": "2026-11-01T16:34:40"},
            "nuhs_live": {"as_of": "2026-11-01T12:01:49", "as_of_basis": "NUHS 'Last updated at'",
                          "last_fetched_at": "2026-11-01T16:33:53"},
            "singstat_residents": {"as_of": "2026-06-30", "as_of_basis": "reference date (end of June)",
                                   "last_fetched_at": "2026-11-01T16:34:42"},
        },
        "coverage_per_hospital": {
            "AH": {"hospital_name": NAMES["AH"], "first_day": FIRST_DAY.isoformat(), "last_day": LAST_DAY.isoformat(),
                   "expected_days": 69, "days_with_wait": 69, "days_with_attendances": 68,
                   "missing_wait_days": 0, "missing_attendance_days": 1},
            "SGH": {"hospital_name": NAMES["SGH"], "first_day": FIRST_DAY.isoformat(), "last_day": LAST_DAY.isoformat(),
                    "expected_days": 69, "days_with_wait": 69, "days_with_attendances": 69,
                    "missing_wait_days": 0, "missing_attendance_days": 0},
        },
        "checks": {
            "blocking": 0,
            "counts": {s: sum(1 for d in latest if d[3] == s) for s in ("pass", "fail", "skipped")},
            "failing": [{"check_id": d[0], "table": d[1], "severity": d[2], "failing_rows": d[4], "scope": d[8],
                         "blocks_publish": False} for d in latest if d[3] == "fail"],
        },
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True))
    return out
