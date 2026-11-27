"""R9: a sheet with no year in its header takes the year its raw file was fetched, never the clock's, so a reparse
in a later year rebuilds the same rows."""
from datetime import date, datetime

from test_pipeline import _xlsx

from sg_health.load import LOADERS
from sg_health.logs import ParseStats
from sg_health.parsers import moh
from sg_health.raw import RawRecord

NO_YEAR = _xlsx([["Hospital", "Date", "Attendances"],
                 ["Singapore General Hospital", "Sun 25 Oct", "412"],
                 ["Khoo Teck Puat Hospital", "Sun 25 Oct", 389]])


class _Year2027(datetime):
    @classmethod
    def now(cls, tz=None):
        return datetime(2027, 1, 15, 9, 0, tzinfo=tz)


def test_the_fallback_year_is_the_fetch_year_not_the_clock(monkeypatch):
    monkeypatch.setattr(moh, "datetime", _Year2027)                    # a reparse in January 2027
    seen = {}
    monkeypatch.setattr("sg_health.load._load", lambda wh, table, df, rec, stats: seen.setdefault("df", df) is not None and len(df))
    rec = RawRecord(seq=0, source="moh_ed_attendances", url="https://www.moh.gov.sg/files/ed.xlsx", sha256="x",
                    bytes=len(NO_YEAR), http_status=200, content_type="xlsx", fetched_at=datetime(2026, 10, 27, 9),
                    path="moh_ed_attendances/2026-10-27/x.xlsx")
    assert LOADERS["moh_ed_attendances"](None, rec, NO_YEAR, ParseStats()) == 2
    assert set(seen["df"]["report_date"]) == {date(2026, 10, 25)}


def test_an_explicit_year_in_the_sheet_still_wins():
    df = moh.parse_moh_workbook(_xlsx([["Daily ED Attendances (25 Oct 2025 - 31 Oct 2025)"], *NO_YEAR_ROWS]),
                                "ed_attendances", fallback_year=2026)
    assert set(df["report_date"]) == {date(2025, 10, 25)}


NO_YEAR_ROWS = [["Hospital", "Date", "Attendances"], ["Singapore General Hospital", "Sun 25 Oct", "412"]]
