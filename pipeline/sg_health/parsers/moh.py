"""MOH weekly Excel workbooks: bed waits and ED attendances."""
from __future__ import annotations

import io
import logging
import re
from collections.abc import Iterable
from datetime import date, datetime
from typing import Any
from urllib.parse import urljoin

import pandas as pd
from bs4 import BeautifulSoup

from ..config import EXCLUDE_HOSPITAL, HOSPITALS, SGT
from ..logs import ParseStats, count_drop, count_read
from .common import is_blank, match_hospital, raw_duration, to_date, to_int

LOG = logging.getLogger(__name__)


def find_xlsx_links(html: str, base_url: str) -> list[str]:
    """Return every absolute .xlsx/.xls link on a page, in page order and without duplicates."""
    soup = BeautifulSoup(html, "lxml")
    links: list[str] = []
    for a in soup.find_all("a", href=True):
        raw = a.get("href")
        if not isinstance(raw, str):              # bs4 can return a list for odd markup: skip, don't crash
            continue
        href = raw.strip()
        if re.search(r"\.xlsx?(?:$|[?#])", href, re.I) or "xlsx" in href.lower():
            absolute = urljoin(base_url, href)
            if absolute not in links:
                links.append(absolute)
    return links


def _detect_unit(text: str) -> str | None:
    t = text.lower()
    if re.search(r"\bmin(ute)?s?\b|\(min", t):
        return "minutes"
    if re.search(r"\bh(ou)?rs?\b|\bhours?\b|\(h", t):
        return "hours"
    return None


def _best_date_column(grid: pd.DataFrame, rows: Iterable[int], exclude: set[int],
                      default_year: int) -> int | None:
    best, best_hits = None, 1
    rows = list(rows)
    for c in grid.columns:
        if c in exclude:
            continue
        hits = sum(1 for r in rows if to_date(grid.iat[r, c], default_year))
        if hits > best_hits:
            best, best_hits = c, hits
    return best


def extract_sheet_records(grid: pd.DataFrame, default_year: int,
                          unrecognised: list[str] | None = None) -> list[tuple[str, date, Any]]:
    """Find (hospital_code, date, raw_value) triples in a messy sheet.

    Tries three layouts in order:
      A. Hospitals across a header row, dates down a column (the most common MOH layout)
      B. Dates across a header row, hospitals down a column
      C. A long table: each row has a date cell, a hospital cell and a value

    ``unrecognised`` (layout A only) collects header cells that are neither the date column,
    a known hospital nor a deliberately excluded one, so a new hospital is never dropped silently.
    """
    grid = grid.dropna(how="all").dropna(axis=1, how="all").reset_index(drop=True)
    if grid.empty:
        return []
    grid.columns = range(grid.shape[1])
    scan = range(min(len(grid), 40))

    # Layout A
    for r in scan:
        hosp_cols: dict[int, str] = {}
        for c in grid.columns:
            code = match_hospital(grid.iat[r, c])
            if code and code not in hosp_cols.values():
                hosp_cols[c] = code
        if len(hosp_cols) >= 2:
            body = range(r + 1, len(grid))
            date_col = _best_date_column(grid, body, set(hosp_cols), default_year)
            if date_col is None:
                continue
            recs: list[tuple[str, date, Any]] = []
            for i in body:
                d = to_date(grid.iat[i, date_col], default_year)
                if d:
                    recs.extend((code, d, grid.iat[i, c]) for c, code in hosp_cols.items())
            if recs:
                if unrecognised is not None:
                    for c in grid.columns:
                        cell = grid.iat[r, c]
                        if (c in hosp_cols or c == date_col or is_blank(cell)
                                or EXCLUDE_HOSPITAL.search(str(cell))):
                            continue
                        unrecognised.append(str(cell).strip())
                return recs

    # Layout B
    for r in scan:
        found = {c: to_date(grid.iat[r, c], default_year) for c in grid.columns}
        date_cols: dict[int, date] = {c: d for c, d in found.items() if d is not None}
        if len(date_cols) >= 2:
            recs = []
            for i in range(r + 1, len(grid)):
                code = next((match_hospital(grid.iat[i, c]) for c in grid.columns
                             if c not in date_cols and match_hospital(grid.iat[i, c])), None)
                if code:
                    recs.extend((code, d, grid.iat[i, c]) for c, d in date_cols.items())
            if recs:
                return recs

    # Layout C
    recs = []
    for i in range(len(grid)):
        row = [grid.iat[i, c] for c in grid.columns]
        d = next((to_date(v, default_year) for v in row if to_date(v, default_year)), None)
        code = next((match_hospital(v) for v in row if match_hospital(v)), None)
        if d and code:
            values = [v for v in row if not is_blank(v) and not to_date(v, default_year)
                      and not match_hospital(v)]
            if values:
                recs.append((code, d, values[-1]))
    return recs


def parse_moh_workbook(content: bytes, metric: str, source_file: str = "",
                       stats: ParseStats | None = None) -> pd.DataFrame:
    """Parse an MOH .xlsx (any sheet, any of the supported layouts) into tidy rows.

    metric="bed_waits"      -> columns: hospital_code, hospital_name, report_date, median_wait_hours
    metric="ed_attendances" -> columns: hospital_code, hospital_name, report_date, total_attendances

    If ``stats`` is given, every candidate (hospital, date) cell is counted as read, and every
    cell not returned is counted as dropped with its reason.
    """
    value_col = "median_wait_hours" if metric == "bed_waits" else "total_attendances"
    empty = pd.DataFrame(columns=["hospital_code", "hospital_name", "report_date", value_col, "source_file"])
    try:
        sheets = pd.read_excel(io.BytesIO(content), sheet_name=None, header=None, engine="openpyxl")
    except Exception as exc:  # corrupt file, HTML error page saved as .xlsx, etc.
        LOG.warning("Cannot open workbook %s: %s", source_file, exc)
        if stats is not None:
            stats.files_skipped["unreadable_workbook"] += 1
        return empty

    frames = []
    unrecognised: list[str] = []
    for sheet_name, grid in sheets.items():
        header_text = f"{sheet_name} " + " ".join(
            str(v) for v in grid.head(12).to_numpy().ravel() if not is_blank(v))
        year_match = re.search(r"\b(20\d{2})\b", header_text)
        default_year = int(year_match.group(1)) if year_match else datetime.now(SGT).year
        recs = extract_sheet_records(grid, default_year, unrecognised)
        if not recs:
            LOG.debug("No records found in sheet %r of %s", sheet_name, source_file)
            continue
        df = pd.DataFrame(recs, columns=["hospital_code", "report_date", "raw"])

        if metric == "bed_waits":
            parsed = df["raw"].map(raw_duration)
            df["val"] = parsed.map(lambda t: t[0])
            df["kind"] = parsed.map(lambda t: t[1])
            numeric = df["kind"] == "numeric"
            if numeric.any():
                unit = _detect_unit(header_text)
                if unit is None:  # no label: a median ED bed wait above 24 must be in minutes
                    unit = "minutes" if df.loc[numeric, "val"].median() > 24 else "hours"
                LOG.info("Sheet %r: numeric wait values treated as %s", sheet_name, unit)
                if unit == "minutes":
                    df.loc[numeric, "val"] = df.loc[numeric, "val"] / 60
            df[value_col] = df["val"].round(2)
        else:
            df[value_col] = df["raw"].map(to_int).astype("Int64")
        df["blank"] = df["raw"].map(is_blank)      # empty in the source: missing, not a parse failure
        df["sheet"] = str(sheet_name)              # units are decided per sheet; checks group by it
        frames.append(df[["hospital_code", "report_date", value_col, "blank", "sheet"]])

    if not frames:
        LOG.warning("No usable tables in %s", source_file)
        if stats is not None:
            stats.files_skipped["no_tables_found"] += 1
        return empty
    out = pd.concat(frames, ignore_index=True)
    count_read(stats, len(out))
    missing = out[value_col].isna()
    blank = int((missing & out["blank"]).sum())
    unparseable = int((missing & ~out["blank"]).sum())
    if unparseable:
        LOG.warning("%s: %d cells have a value that could not be read", source_file or metric, unparseable)
    count_drop(stats, "blank", blank)                       # e.g. a hospital before its ED opened
    count_drop(stats, "unparseable_value", unparseable)
    out = out.dropna(subset=[value_col])
    # Duplicate (hospital, date) pairs are kept: the data-quality gate decides (identical copies
    # are merged, conflicting ones quarantined) instead of the parser silently picking one.
    out["hospital_name"] = out["hospital_code"].map(lambda c: HOSPITALS[c][0])
    out["source_file"] = source_file
    out = out[["hospital_code", "hospital_name", "report_date", value_col, "source_file", "sheet"]] \
        .sort_values(["report_date", "hospital_code"], kind="stable").reset_index(drop=True)
    out.attrs["unrecognised_columns"] = sorted(set(unrecognised))   # read by the data-quality gate
    return out
