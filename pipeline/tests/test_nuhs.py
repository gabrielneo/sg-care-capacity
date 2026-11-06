"""NUHS lists the same hospital under Adult and Children's Emergency. Both rows must survive.

Fixture mirrors the live page structure seen on 2026-11-06: two tables, each with a site
header row, and "National University Hospital" in both.
"""
import pytest

from sg_health.parsers.live import parse_nuhs_live

from conftest import HTML, NUHS_HTML, source_routes
from test_ingest import full_run, query

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
