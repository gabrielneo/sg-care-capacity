"""Helpers shared by the ED detectors: the analysis window, names and caveats."""
from __future__ import annotations

from datetime import date, timedelta

import pandas as pd

WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
UNIT_CAVEAT = "MOH doesn't state the unit; the values are read as hours."
WEEKLY_CAVEAT = "A week's figure is the average of each day's median."


def latest_complete_week(weekly: pd.DataFrame) -> date | None:
    done = weekly[weekly["is_complete_week"].astype(bool)]
    return None if done.empty else pd.to_datetime(done["week_start"]).max().date()


def window_starts(latest: date, weeks: int) -> list[date]:
    return [latest - timedelta(weeks=k) for k in range(weeks - 1, -1, -1)]


def expected_weeks(starts: list[date], reported_from: date | None) -> int:
    """Weeks in the window the hospital was reported for (Woodlands only from June 2024)."""
    return sum(1 for s in starts if reported_from is None or s + timedelta(days=6) >= reported_from)


def reported_from(h: pd.Series) -> date | None:
    """The day MOH starts reporting a site, or None (pandas gives NaT for a missing date)."""
    v = h.get("reported_from")
    return None if v is None or pd.isna(v) else pd.Timestamp(v).date()


def hospital_name(h: pd.Series) -> str:
    return str(h["hospital_name"]).replace(" (UCC)", "")


def hospital_caveats(h: pd.Series) -> list[str]:
    out = []
    if h.get("facility_type") == "UCC":
        out.append("Alexandra Hospital runs an urgent care centre, not a full emergency department.")
    note = h.get("coverage_note")
    if isinstance(note, str) and note.lower().startswith("adult"):
        out.append("MOH's figures for this hospital cover adults only.")
    return out


def week_text(start: date) -> str:
    end = start + timedelta(days=6)
    b = end.strftime("%-d %b %Y")
    return f"{start.day}–{b}" if start.month == end.month else f"{start.strftime('%-d %b')} – {b}"


def daily_window(daily: pd.DataFrame, latest: date, weeks: int) -> pd.DataFrame:
    """Daily rows in the `weeks` ISO weeks ending with the week starting `latest`."""
    first = latest - timedelta(weeks=weeks - 1)
    d = daily.assign(report_date=pd.to_datetime(daily["report_date"]).dt.date)
    return d[(d["report_date"] >= first) & (d["report_date"] <= latest + timedelta(days=6))]


def expected_days(first: date, last: date, reported_from: date | None) -> int:
    start = max(first, reported_from) if reported_from else first
    return max((last - start).days + 1, 0)
