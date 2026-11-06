"""Generic cell-level parsing helpers shared by every source parser."""
from __future__ import annotations

import hashlib
import math
import re
from datetime import date, datetime, time as dtime, timedelta
from typing import Any, Optional

import pandas as pd

from ..config import EXCLUDE_HOSPITAL, HOSPITALS, SGT


def is_blank(v: Any) -> bool:
    if v is None:
        return True
    try:
        if pd.isna(v):
            return True
    except (TypeError, ValueError):
        pass
    return isinstance(v, str) and v.strip() in {"", "-", "–", "N/A", "NA", "n.a.", "na", "nan"}


def match_hospital(value: Any) -> Optional[str]:
    """Map free-text such as 'Changi General Hospital' or 'CGH' to a canonical code."""
    if is_blank(value) or not isinstance(value, str):
        return None
    text = value.strip().lower()
    if len(text) > 80 or EXCLUDE_HOSPITAL.search(text):
        return None
    for code, (_, pattern) in HOSPITALS.items():
        if re.search(pattern, text):
            return code
    return None


_DATE_SHAPE = re.compile(
    r"(\d{4}-\d{1,2}-\d{1,2})|(\d{1,2}[/.\-]\d{1,2}([/.\-]\d{2,4})?)|"
    r"(\d{1,2}[\s\-/.]*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*)|"
    r"((jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\-/.]*\d{1,2})",
    re.I,
)


def to_date(value: Any, default_year: Optional[int] = None) -> Optional[date]:
    """Parse Excel or text dates the Singapore way (day first). Returns None if it isn't a date."""
    if is_blank(value) or isinstance(value, bool):
        return None
    if isinstance(value, pd.Timestamp):
        return value.date()
    if isinstance(value, datetime):
        return value.date() if value.year > 1900 else None   # 1899/1900 means a time, not a date
    if isinstance(value, date):
        return value
    if isinstance(value, (int, float)):
        if 30000 < float(value) < 80000:                     # Excel serial date (1982-2119)
            return (datetime(1899, 12, 30) + timedelta(days=float(value))).date()
        return None
    text = str(value).strip()
    if len(text) > 40 or not _DATE_SHAPE.search(text):
        return None
    text = re.sub(r"\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?", "", text, flags=re.I).strip()
    if not re.search(r"\b(19|20)\d{2}\b", text):
        if not re.search(r"[a-z]", text, re.I) and not re.search(r"\d{1,2}[/.\-]\d{1,2}", text):
            return None
        text = f"{text} {default_year or datetime.now(SGT).year}"
    ts = pd.to_datetime(text, dayfirst=True, errors="coerce")
    if pd.isna(ts) or not 2000 <= ts.year <= 2100:
        return None
    return ts.date()


def raw_duration(value: Any) -> tuple[Optional[float], str]:
    """Convert a single cell to (number, kind).

    kind="hours"   -> already converted to hours (time-like values: 03:25, 3h 20m, timedelta)
    kind="numeric" -> a bare number whose unit (minutes or hours) is decided later per series
    kind="none"    -> unparseable or blank
    """
    if is_blank(value) or isinstance(value, bool):
        return None, "none"
    if isinstance(value, pd.Timedelta) or isinstance(value, timedelta):
        return pd.Timedelta(value).total_seconds() / 3600, "hours"
    if isinstance(value, dtime):
        return value.hour + value.minute / 60 + value.second / 3600, "hours"
    if isinstance(value, datetime) and value.year <= 1900:   # Excel durations >24h become 1900-01-xx
        return (value - datetime(1899, 12, 30)).total_seconds() / 3600, "hours"
    if isinstance(value, (int, float)):
        return (None, "none") if math.isnan(float(value)) else (float(value), "numeric")
    text = str(value).strip().lower()
    m = re.fullmatch(r"(\d{1,3}):(\d{2})(?::(\d{2}))?", text)
    if m:
        h, mi, s = int(m.group(1)), int(m.group(2)), int(m.group(3) or 0)
        return h + mi / 60 + s / 3600, "hours"
    hours = parse_duration_hours(text)
    if hours is not None:
        return hours, "hours"
    try:
        return float(text.replace(",", "")), "numeric"
    except ValueError:
        return None, "none"


def parse_duration_hours(text: str) -> Optional[float]:
    """'1 hour(s)', '2 hrs 30 mins', '45 min' -> hours. Returns None if there's no unit."""
    if not text:
        return None
    text = text.lower()
    hrs = re.findall(r"(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours|hour\(s\))\b", text)
    mins = re.findall(r"(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes|min\(s\)|minute\(s\))\b", text)
    if not hrs and not mins:
        return None
    return sum(float(x) for x in hrs) + sum(float(x) for x in mins) / 60


def to_int(value: Any) -> Optional[int]:
    if is_blank(value) or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return None if math.isnan(float(value)) else int(round(float(value)))
    m = re.search(r"-?\d[\d,]*", str(value))
    return int(m.group(0).replace(",", "")) if m else None


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()
