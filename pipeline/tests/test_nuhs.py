"""NUHS lists the same hospital under Adult and Children's Emergency. Both rows must survive.

Fixture mirrors the live page structure seen on 2026-11-06: two tables, each with a site
header row, and "National University Hospital" in both.
"""
import pytest
from conftest import HTML, NUHS_HTML, source_routes
from test_ingest import full_run, query

from sg_health.parsers.live import parse_nuhs_live

pytest.importorskip("duckdb")

TWO_DEPARTMENTS = b"""
<h3>Adult Emergency</h3><table>
 <tr><th></th><th>Alexandra Hospital</th><th>National University Hospital</th></tr>
 <tr><td></td><td></td><td></td></tr>
 <tr><td>Number of Patients Waiting for Consult</td><td>4 patient(s)</td><td>18 patient(s)</td></tr>
 <tr><td>Estimated Wait Time to See Doctor</td><td>1 hour(s)</td><td>2 hour(s)</td></tr>
 <tr><td>Estimated Bed Wait Time</td><td>1 hour(s)</td><td>20 hour(s)</td></tr></table>
<h3>Children's Emergency</h3><table>
 <tr><th></th><th>National University Hospital</th></tr>
 <tr><td></td><td></td></tr>
 <tr><td>Number of Patients Waiting for Consult</td><td>2 patient(s)</td></tr>
 <tr><td>Estimated Wait Time to See Doctor</td><td>1 hour(s)</td></tr>
 <tr><td>Estimated Bed Wait Time</td><td>1 hour(s)</td></tr></table>
<p>Last updated at 06 Nov 2026, 12:01:49 PM.</p>"""


def test_parser_tags_each_row_with_its_department():
    rows = {(r["site_name"], r["department"]): r for r in parse_nuhs_live(TWO_DEPARTMENTS.decode())}
    assert set(rows) == {("Alexandra Hospital", "Adult Emergency"),
                         ("National University Hospital", "Adult Emergency"),
                         ("National University Hospital", "Children's Emergency")}
    assert rows[("National University Hospital", "Adult Emergency")]["est_bed_wait_hours"] == 20


def test_adult_and_children_rows_for_the_same_hospital_are_both_stored(monkeypatch, paths):
    from sg_health import config
    routes = source_routes()
    routes[config.NUHS_LIVE_URL] = (TWO_DEPARTMENTS, HTML)
    full_run(monkeypatch, paths, routes)
    nuh = query(paths, """SELECT department, patients_waiting, est_bed_wait_hours FROM nuhs_live_waits
                          WHERE site_name = 'National University Hospital' ORDER BY department""")
    assert nuh.to_dict("records") == [
        {"department": "Adult Emergency", "patients_waiting": 18, "est_bed_wait_hours": 20.0},
        {"department": "Children's Emergency", "patients_waiting": 2, "est_bed_wait_hours": 1.0}]


def test_single_column_table_without_site_header_keeps_heading_as_both():
    rows = parse_nuhs_live(NUHS_HTML.decode() + "<h3>Children's Emergency</h3><table>"
                           "<tr><td>Number of Patients Waiting for Consult</td><td>2 patient(s)</td></tr></table>")
    child = [r for r in rows if r["site_name"] == "Children's Emergency"]
    assert child and child[0]["department"] == "Children's Emergency"


# ------------------------------------------------- bounds: "< 1 hour(s)" (audit C-1) #

# As published on 2026-11-08 at 10:00 pm: NUHS writes "< 1 hour(s)" when the wait is under an hour.
BOUNDED = TWO_DEPARTMENTS.replace(b"<td>1 hour(s)</td><td>2 hour(s)</td>", b"<td>&lt; 1 hour(s)</td><td>2 hour(s)</td>") \
    .replace(b"<td>1 hour(s)</td><td>20 hour(s)</td>", b"<td>&lt; 1 hour(s)</td><td>20 hour(s)</td>")


@pytest.mark.parametrize("text, bound", [
    ("< 1 hour(s)", "<"), ("&lt; 1 hour(s)", "<"), ("less than 1 hour", "<"), ("Under 30 mins", "<"),
    ("> 12 hour(s)", ">"), ("more than 12 hours", ">"), ("1 hour(s)", None), ("2 hrs 30 mins", None), ("", None), (None, None),
])
def test_duration_bound_reads_a_leading_less_or_more_than(text, bound):
    from sg_health.parsers.common import duration_bound
    assert duration_bound(text) == bound


def test_a_bounded_estimate_keeps_its_bound_and_qualifier_not_a_point_value():
    rows = {(r["site_name"], r["department"]): r for r in parse_nuhs_live(BOUNDED.decode())}
    ah = rows[("Alexandra Hospital", "Adult Emergency")]
    assert (ah["est_consult_wait_hours"], ah["est_consult_wait_qualifier"]) == (1.0, "<")
    assert (ah["est_bed_wait_hours"], ah["est_bed_wait_qualifier"]) == (1.0, "<")
    nuh = rows[("National University Hospital", "Adult Emergency")]
    assert (nuh["est_bed_wait_hours"], nuh["est_bed_wait_qualifier"]) == (20.0, None)
    assert nuh["est_consult_wait_qualifier"] is None


def test_the_text_fallback_keeps_bounds_too():
    from sg_health.parsers.live import _parse_nuhs_text
    rows = _parse_nuhs_text("Estimated Wait Time to See Doctor < 1 hour(s) 3 hour(s) Estimated Bed Wait Time 5 hour(s) < 1 hour(s)")
    assert [(r["est_consult_wait_hours"], r["est_consult_wait_qualifier"]) for r in rows] == [(1.0, "<"), (3.0, None)]
    assert [(r["est_bed_wait_hours"], r["est_bed_wait_qualifier"]) for r in rows] == [(5.0, None), (1.0, "<")]


def test_bounded_estimates_reach_the_mart_flagged_and_stay_out_of_the_comparison(monkeypatch, paths):
    from sg_health import config
    routes = source_routes()
    routes[config.NUHS_LIVE_URL] = (BOUNDED, HTML)
    full_run(monkeypatch, paths, routes)
    stored = query(paths, """SELECT site_name, est_bed_wait_hours, coalesce(est_bed_wait_qualifier, 'NULL') AS bed_q,
                                    coalesce(est_consult_wait_qualifier, 'NULL') AS see_q
                             FROM nuhs_live_waits WHERE department = 'Adult Emergency' ORDER BY site_name""")
    assert stored.to_dict("records") == [
        {"site_name": "Alexandra Hospital", "est_bed_wait_hours": 1.0, "bed_q": "<", "see_q": "<"},
        {"site_name": "National University Hospital", "est_bed_wait_hours": 20.0, "bed_q": "NULL", "see_q": "NULL"}]
    mart = query(paths, """SELECT est_bed_wait_qualifier, est_wait_to_see_doctor_qualifier FROM marts.fct_live_ed_snapshot
                           WHERE hospital_code = 'AH'""")
    assert mart.to_dict("records") == [{"est_bed_wait_qualifier": "<", "est_wait_to_see_doctor_qualifier": "<"}]
    flagged = query(paths, "SELECT row_key, detail FROM dq_findings WHERE check_id = 'live.bounded_estimate'")
    assert len(flagged) == 1 and "Alexandra Hospital (Adult Emergency): wait to see a doctor < 1 h; bed wait < 1 h" in flagged["detail"][0]
    assert not len(query(paths, "SELECT * FROM quarantine_nuhs_live_waits"))          # a WARN: kept, not quarantined
