"""Offline tests: synthetic fixtures that mimic each source's layout. No network needed.

Run:  pytest -q
"""
import io
import json
from datetime import date, datetime, time

import pandas as pd
import pytest
from openpyxl import Workbook, load_workbook

import sg_health as p


def _xlsx(rows, sheet="Sheet1") -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = sheet
    for r in rows:
        ws.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ---------------------------------------------------------------- MOH Excel #

def test_bed_waits_hospitals_across_columns_with_time_cells():
    content = _xlsx([
        ["Waiting Time for Admission to Ward (Median)"],
        [None],
        ["Date", "AH (UCC)", "CGH", "KTPH", "NUH (Adult)", "NTFGH", "SKH", "SGH", "TTSH"],
        [datetime(2026, 10, 25), time(3, 30), time(5, 0), time(2, 15), time(10, 45),
         time(4, 0), time(6, 30), time(3, 0), time(4, 45)],
        [datetime(2026, 10, 26), time(2, 0), "-", time(2, 0), time(12, 0),
         time(4, 0), time(7, 0), time(3, 0), time(5, 0)],
    ])
    df = p.parse_moh_workbook(content, "bed_waits", "wk43.xlsx")
    assert len(df) == 15                       # 16 cells minus one "-"
    row = df[(df.hospital_code == "NUH") & (df.report_date == date(2026, 10, 25))].iloc[0]
    assert row.median_wait_hours == pytest.approx(10.75)
    assert set(df.hospital_code) == {"AH", "CGH", "KTPH", "NUH", "NTFGH", "SKH", "SGH", "TTSH"}


def test_bed_waits_numeric_minutes_detected_from_header():
    content = _xlsx([
        ["Median waiting time (mins)"],
        ["Hospital", "25-Oct-2026", "26-Oct-2026"],
        ["Changi General Hospital", 300, 240],
        ["Tan Tock Seng Hospital", 285, "270"],
        ["NUH (Children)", 60, 60],            # excluded on purpose
    ])
    df = p.parse_moh_workbook(content, "bed_waits")
    assert len(df) == 4
    assert df.median_wait_hours.max() == pytest.approx(5.0)
    assert "NUH" not in set(df.hospital_code)


def test_bed_waits_hhmm_strings_and_unlabelled_minutes_heuristic():
    content = _xlsx([
        ["Date", "SGH", "SKH"],
        ["25/10/2026", "03:20", "11:05"],
        ["26/10/2026", "04:00", "12:00"],
    ])
    df = p.parse_moh_workbook(content, "bed_waits")
    assert df.loc[(df.hospital_code == "SKH") & (df.report_date == date(2026, 10, 25)),
                  "median_wait_hours"].iloc[0] == pytest.approx(11.08, abs=0.01)

    unlabelled = _xlsx([["Date", "SGH", "CGH"], ["25 Oct 2026", 180, 300], ["26 Oct 2026", 200, 320]])
    df2 = p.parse_moh_workbook(unlabelled, "bed_waits")
    assert df2.median_wait_hours.max() == pytest.approx(5.33, abs=0.01)   # treated as minutes


def test_ed_attendances_long_layout_and_missing_year():
    content = _xlsx([
        ["Daily ED Attendances (25 Oct 2026 - 31 Oct 2026)"],
        ["Hospital", "Date", "Attendances"],
        ["Singapore General Hospital", "Sun 25 Oct", "412"],
        ["Singapore General Hospital", "Mon 26 Oct", "1,050"],
        ["Khoo Teck Puat Hospital", "Sun 25 Oct", 389],
    ])
    df = p.parse_moh_workbook(content, "ed_attendances")
    assert len(df) == 3
    assert df.report_date.min() == date(2026, 10, 25)
    assert int(df.loc[df.report_date == date(2026, 10, 26), "total_attendances"].iloc[0]) == 1050


def test_corrupt_workbook_returns_empty_frame():
    df = p.parse_moh_workbook(b"<html>not an xlsx</html>", "bed_waits")
    assert df.empty and "median_wait_hours" in df.columns


def test_find_xlsx_links():
    html = """<a href="/files/wk43.xlsx">Download</a><a href="https://cdn.x/y.XLSX?v=2">x</a>
              <a href="/files/wk43.xlsx">dup</a><a href="/page">no</a>"""
    links = p.find_xlsx_links(html, "https://www.moh.gov.sg/others/a/")
    assert links == ["https://www.moh.gov.sg/files/wk43.xlsx", "https://cdn.x/y.XLSX?v=2"]


# -------------------------------------------------------------- Live pages #

NUHS_HTML = """
<h2>Emergency Department</h2>
<table>
 <tr><th></th><th>National University Hospital</th><th>Ng Teng Fong General Hospital</th>
     <th>Alexandra Hospital</th></tr>
 <tr><td>Number of Patients Waiting for Consult</td><td>4 patient(s)</td><td>15 patient(s)</td>
     <td>9 patient(s)</td></tr>
 <tr><td>Estimated Wait Time to See Doctor</td><td>1 hour(s)</td><td>1 hour(s)</td><td>2 hour(s)</td></tr>
 <tr><td>Estimated Bed Wait Time</td><td>3 hour(s)</td><td>26 hour(s)</td><td>20 hour(s)</td></tr>
</table>
<h3>Children's Emergency</h3>
<table>
 <tr><td>Number of Patients Waiting for Consult</td><td>2 patient(s)</td></tr>
 <tr><td>Estimated Bed Wait Time</td><td>1 hour(s) 30 min(s)</td></tr>
</table>
<p>Last updated at 18 May 2026, 09:30:04 AM.</p>
"""


def test_nuhs_table_parser():
    rows = p.parse_nuhs_live(NUHS_HTML)
    by_site = {r["site_name"]: r for r in rows}
    assert by_site["Ng Teng Fong General Hospital"]["est_bed_wait_hours"] == 26
    assert by_site["National University Hospital"]["patients_waiting"] == 4
    assert by_site["Children's Emergency"]["est_bed_wait_hours"] == pytest.approx(1.5)
    assert rows[0]["source_updated_at"] == datetime(2026, 5, 18, 9, 30, 4)


def test_nuhs_text_fallback_when_no_tables():
    html = ("<div>Number of Patients Waiting for Consult 4 patient(s) 15 patient(s)</div>"
            "<div>Estimated Bed Wait Time 3 hour(s) 26 hour(s)</div>")
    rows = p.parse_nuhs_live(html)
    assert [r["est_bed_wait_hours"] for r in rows] == [3, 26]
    assert [r["patients_waiting"] for r in rows] == [4, 15]


# ------------------------------------------------------ data.gov.sg / SingStat #

def test_chas_geojson_with_html_description():
    desc = ("<center><table><tr><th>HCI_CODE</th><td>15M0211</td></tr>"
            "<tr><th>HCI_NAME</th><td>JOO KOON CLINIC</td></tr>"
            "<tr><th>POSTAL_CD</th><td>629117</td></tr>"
            "<tr><th>CLINIC_PROGRAMME_CODE</th><td>CHAS,CDMP</td></tr>"
            "<tr><th>BLK_HSE_NO</th><td>1</td></tr><tr><th>STREET_NAME</th><td>JOO KOON CIRCLE</td></tr>"
            "</table></center>")
    geo = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"Name": "kml_1", "Description": desc},
         "geometry": {"type": "Point", "coordinates": [103.6784, 1.3256, 0.0]}},
        {"type": "Feature", "properties": {"Name": "kml_2", "Description": desc.replace("CHAS,CDMP", "CHAS")
                                           .replace("15M0211", "15M0999")},
         "geometry": {"type": "Point", "coordinates": [103.70, 1.33]}},
    ]}
    df = p.normalize_clinics(p.parse_datagov_payload(json.dumps(geo).encode()))
    assert len(df) == 2
    first = df.iloc[0]
    assert first.clinic_name == "JOO KOON CLINIC" and first.postal_code == "629117"
    assert first.latitude == pytest.approx(1.3256) and bool(first.has_cdmp) is True
    assert bool(df.iloc[1].has_cdmp) is False
    assert "JOO KOON CIRCLE" in first.address


def test_csv_payload_and_postal_zero_padding():
    csv = "clinic_name,address,postal_code,latitude,longitude\nA Clinic,1 Road,18989,1.3,103.8\n"
    df = p.normalize_clinics(p.parse_datagov_payload(csv.encode()))
    assert df.iloc[0].postal_code == "018989"
    assert df.iloc[0].has_cdmp is None


def test_singstat_flatten_and_pop65():
    payload = {"Data": {"title": "Residents by Planning Area and Age Group, June 2025", "row": [
        {"rowText": "Bedok", "columns": [
            {"key": "2025", "columns": [{"key": "60 - 64", "value": "20,000"},
                                        {"key": "65 - 69", "value": "18,000"},
                                        {"key": "90 & Over", "value": "1,200"}]}]},
        {"rowText": "Total", "columns": [{"key": "2025", "columns": [{"key": "65 - 69", "value": "1"}]}]},
    ]}}
    flat = p.parse_singstat_tabledata(payload, "TEST1")
    assert len(flat) == 4
    pop = p.derive_pop65(flat, 2025)
    assert pop.to_dict("records") == [{"planning_area": "Bedok", "year": 2025, "residents_65plus": 19200.0}]


# ------------------------------------------------------------- Excel report #

def test_excel_report_formatting(tmp_path):
    summary = pd.DataFrame({"report_date": [date(2026, 10, 25)], "hospital_name": ["Changi General Hospital"],
                            "median_wait_hours": [5.0], "total_attendances": [400]})
    out = p.build_excel_report({"MOH_Weekly_Summary": summary, "CHAS_Clinic_Directory": pd.DataFrame()},
                               tmp_path / "r.xlsx")
    wb = load_workbook(out)
    ws = wb["MOH_Weekly_Summary"]
    assert ws["A1"].fill.start_color.rgb.endswith("1F4E79")
    assert ws["A1"].font.bold and ws["A1"].font.color.rgb.endswith("FFFFFF")
    assert ws["A2"].fill.start_color.rgb.endswith("F2F4F7")
    assert ws.freeze_panes == "A2" and ws.auto_filter.ref == "A1:D2"
    assert ws.column_dimensions["B"].width == len("Changi General Hospital") + 4
    assert wb["CHAS_Clinic_Directory"]["A2"].value == "No data yet"


# ---------------------------------------------------------------- DuckDB #

def test_warehouse_upsert_is_idempotent(tmp_path):
    pytest.importorskip("duckdb")
    wh = p.Warehouse(tmp_path / "t.duckdb")
    df = pd.DataFrame({"hospital_name": ["SGH", "SGH"], "report_date": [date(2026, 10, 25)] * 2,
                       "median_wait_hours": [3.0, 3.5], "hospital_code": ["SGH"] * 2,
                       "source_url": ["https://x/a.xlsx"] * 2, "source_sha256": ["0" * 64] * 2,
                       "ingested_at": [datetime(2026, 11, 1)] * 2})
    wh.upsert("moh_bed_waits", df, ["hospital_name", "report_date"])
    wh.upsert("moh_bed_waits", df, ["hospital_name", "report_date"])
    out = wh.query("SELECT * FROM moh_bed_waits")
    assert len(out) == 1 and out.median_wait_hours.iloc[0] == 3.5
    wh.close()
