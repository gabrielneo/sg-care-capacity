#!/usr/bin/env python3
"""
Singapore Healthcare Capacity Pipeline
======================================

ETL pipeline for a portfolio project on Singapore's super-aged population and
hospital bottlenecks. It collects only aggregate data from institutions, places
and populations. It collects no personal data.

Sources
-------
1. MOH "Healthcare Institution Statistics" (weekly .xlsx downloads)
   - Waiting Time for Admission to Ward (daily median, per ED)  -> moh_bed_waits
   - Attendances at Emergency Medicine Departments (daily)      -> moh_ed_attendances
2. Live public wait-time pages (polite snapshots)
   - NUHS ED wait times                                          -> nuhs_live_waits
   - SingHealth X-ray QWatch                                     -> singhealth_xray_waits
3. Open APIs
   - data.gov.sg: CHAS clinics (GeoJSON)                        -> chas_clinics
   - data.gov.sg: Clinics on the Health Appointment System      -> has_clinics
   - SingStat Table Builder: 65+ residents by planning area     -> singstat_tabledata,
                                                                   pop_65plus_by_area

Outputs
-------
- DuckDB warehouse: singapore_healthcare.duckdb (idempotent upserts)
- Formatted Excel report: SG_Healthcare_Scrape_Report.xlsx

Usage
-----
    python sg_health_pipeline.py run                       # all sources + report
    python sg_health_pipeline.py run --sources moh,live    # subset
    python sg_health_pipeline.py backfill --start 2024-01-01 --max-snapshots 60
    python sg_health_pipeline.py report                    # rebuild Excel only

All timestamps are stored in Singapore time (SGT, UTC+8, no DST), as naive
TIMESTAMP values.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import logging
import math
import os
import random
import re
import sys
import time
from datetime import date, datetime, time as dtime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable, Optional
from urllib import robotparser
from urllib.parse import urljoin, urlparse

import pandas as pd
import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# --------------------------------------------------------------------------- #
# Configuration
# --------------------------------------------------------------------------- #

LOG = logging.getLogger("sg_health")

SGT = timezone(timedelta(hours=8))  # Singapore has no DST, so a fixed offset is safe

# Identify the crawler honestly. Replace the URL with your public repo so site
# owners can see what the bot is. Do NOT put a personal email address here.
USER_AGENT = os.getenv(
    "CRAWLER_USER_AGENT",
    "SGHealthcareResearchCrawler/1.0 (non-commercial portfolio research; "
    "+https://github.com/gabrielneo/sg-healthcare-pipeline)",
)
REQUEST_TIMEOUT = 15            # seconds, per request
POLITE_DELAY = (1.5, 3.0)       # random seconds between requests to the same crawler
ARCHIVE_DELAY = (4.0, 7.0)      # be gentler with the Internet Archive

MOH_INDEX_URL = "https://www.moh.gov.sg/others/resources-and-statistics/"
MOH_SOURCES: dict[str, dict[str, Any]] = {
    "bed_waits": {
        "url": "https://www.moh.gov.sg/others/resources-and-statistics/"
               "healthcare-institution-statistics-waiting-time-for-admission-to-ward/",
        "keywords": ["waiting time for admission to ward"],
        "table": "moh_bed_waits",
        # Older MOH site path, used only for Wayback backfill. Best-known pattern; verify.
        "legacy_urls": ["https://www.moh.gov.sg/resources-statistics/"
                        "healthcare-institution-statistics/waiting-time-for-admission-to-ward"],
    },
    "ed_attendances": {
        "url": "https://www.moh.gov.sg/others/resources-and-statistics/"
               "healthcare-institution-statistics-attendances-at-emergency-medicine-departments/",
        "keywords": ["attendances at emergency medicine"],
        "table": "moh_ed_attendances",
        "legacy_urls": ["https://www.moh.gov.sg/resources-statistics/"
                        "healthcare-institution-statistics/attendances-at-emergency-medicine-departments"],
    },
}

NUHS_LIVE_URL = "https://www.nuhs.edu.sg/patient-care/emergency-department-wait-times"
SINGHEALTH_QWATCH_URL = "https://www.singhealth.com.sg/patient-care/xrayqwatch"

DATAGOV_BASE = "https://api-open.data.gov.sg/v1/public/api/datasets"
DATAGOV_DATASETS = {
    "chas": "d_65d11d02ab0246cec53bfc995c782628",  # CHAS Clinics (GeoJSON)
    "has": "d_3cd840069e95b6a521aa5301a084b25a",   # Clinics onboard Health Appointment System
}
DATAGOV_API_KEY = os.getenv("DATAGOV_API_KEY")      # optional, gives higher rate limits

# SingStat Table Builder resource ID for "residents by planning area x age group".
# Find it at https://tablebuilder.singstat.gov.sg (it's in the table URL), then
# set the env var or pass --singstat-table. Skipped if not set.
SINGSTAT_URL = "https://tablebuilder.singstat.gov.sg/api/table/tabledata/{table_id}"
SINGSTAT_POP_TABLE_ID = os.getenv("SINGSTAT_POP_TABLE_ID")

# Canonical hospitals. Regexes run on lower-cased cell text.
HOSPITALS: dict[str, tuple[str, str]] = {
    "AH":    ("Alexandra Hospital (UCC)",      r"alexandra|\bah\b"),
    "CGH":   ("Changi General Hospital",       r"changi|\bcgh\b"),
    "KTPH":  ("Khoo Teck Puat Hospital",       r"khoo\s*teck\s*puat|\bktph\b"),
    "NUH":   ("National University Hospital",  r"national\s*university\s*hospital|\bnuh\b"),
    "NTFGH": ("Ng Teng Fong General Hospital", r"ng\s*teng\s*fong|\bntfgh\b"),
    "SKH":   ("Sengkang General Hospital",     r"sengkang|\bskh\b|\bskgh\b"),
    "SGH":   ("Singapore General Hospital",    r"singapore\s*general|\bsgh\b"),
    "TTSH":  ("Tan Tock Seng Hospital",        r"tan\s*tock\s*seng|\bttsh\b"),
    "WH":    ("Woodlands Hospital",            r"woodlands"),
}
_EXCLUDE_HOSPITAL = re.compile(r"child|paediatric|pediatric|kk\s*women|\bkkh\b", re.I)


def now_sgt() -> datetime:
    """Current Singapore time as a naive datetime (what we store in DuckDB)."""
    return datetime.now(SGT).replace(tzinfo=None, microsecond=0)


# --------------------------------------------------------------------------- #
# Polite HTTP client
# --------------------------------------------------------------------------- #

class PoliteHttp:
    """requests.Session wrapper with retries, rate limiting, timeouts and robots.txt.

    - Retries 429/5xx with exponential backoff and honours Retry-After.
    - Sleeps a random 1.5-3 s between requests (configurable per call).
    - Checks robots.txt for HTML pages. Official APIs skip the check.
    - Never raises on network errors. It logs them and returns None, so a
      single failing source never kills the whole pipeline.
    """

    def __init__(self, user_agent: str = USER_AGENT, delay: tuple[float, float] = POLITE_DELAY,
                 timeout: int = REQUEST_TIMEOUT) -> None:
        self.delay = delay
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": user_agent,
            "Accept-Language": "en-SG,en;q=0.9",
        })
        retry = Retry(
            total=4, connect=3, read=3, status=4,
            backoff_factor=2,                       # 2s, 4s, 8s, 16s
            status_forcelist=(429, 500, 502, 503, 504),
            allowed_methods=frozenset({"GET", "HEAD"}),
            respect_retry_after_header=True,
            raise_on_status=False,
        )
        adapter = HTTPAdapter(max_retries=retry)
        self.session.mount("https://", adapter)
        self.session.mount("http://", adapter)
        self._last_request = 0.0
        self._robots: dict[str, Optional[robotparser.RobotFileParser]] = {}

    # -- etiquette ---------------------------------------------------------- #
    def _sleep_politely(self, delay: Optional[tuple[float, float]]) -> None:
        lo, hi = delay or self.delay
        wait = random.uniform(lo, hi) - (time.monotonic() - self._last_request)
        if self._last_request and wait > 0:
            time.sleep(wait)

    def allowed(self, url: str) -> bool:
        """Return False only if robots.txt explicitly disallows our user agent."""
        parts = urlparse(url)
        host = f"{parts.scheme}://{parts.netloc}"
        if host not in self._robots:
            rp: Optional[robotparser.RobotFileParser] = robotparser.RobotFileParser()
            try:
                r = self.session.get(f"{host}/robots.txt", timeout=self.timeout)
                if r.status_code == 200:
                    rp.parse(r.text.splitlines())
                else:
                    rp = None  # no robots.txt means everything is allowed
            except requests.RequestException:
                rp = None
            self._robots[host] = rp
        rp = self._robots[host]
        ok = True if rp is None else rp.can_fetch(self.session.headers["User-Agent"], url)
        if not ok:
            LOG.warning("robots.txt disallows %s, skipping", url)
        return ok

    # -- requests ----------------------------------------------------------- #
    def get(self, url: str, *, params: Optional[dict] = None, headers: Optional[dict] = None,
            delay: Optional[tuple[float, float]] = None, check_robots: bool = True
            ) -> Optional[requests.Response]:
        if check_robots and not self.allowed(url):
            return None
        self._sleep_politely(delay)
        try:
            resp = self.session.get(url, params=params, headers=headers, timeout=self.timeout)
        except requests.RequestException as exc:
            LOG.warning("GET %s failed: %s", url, exc)
            return None
        finally:
            self._last_request = time.monotonic()
        if resp.status_code >= 400:
            LOG.warning("GET %s -> HTTP %s", url, resp.status_code)
            return None
        return resp

    def get_text(self, url: str, **kw) -> Optional[str]:
        r = self.get(url, **kw)
        return r.text if r is not None else None

    def get_bytes(self, url: str, **kw) -> Optional[bytes]:
        r = self.get(url, **kw)
        return r.content if r is not None else None

    def get_json(self, url: str, **kw) -> Optional[Any]:
        r = self.get(url, **kw)
        if r is None:
            return None
        try:
            return r.json()
        except ValueError:
            LOG.warning("Non-JSON response from %s", url)
            return None


def render_with_playwright(url: str, wait_ms: int = 4000) -> Optional[str]:
    """Fallback for JavaScript-rendered pages. Returns the HTML, or None if Playwright isn't installed.

    Setup: pip install playwright && python -m playwright install chromium
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        LOG.info("Playwright not installed, skipping JS render for %s", url)
        return None
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(user_agent=USER_AGENT)
            page.goto(url, timeout=30_000, wait_until="domcontentloaded")
            page.wait_for_timeout(wait_ms)
            html = page.content()
            browser.close()
            return html
    except Exception as exc:  # browser errors vary widely by platform
        LOG.warning("Playwright render failed for %s: %s", url, exc)
        return None


# --------------------------------------------------------------------------- #
# Generic parsing helpers
# --------------------------------------------------------------------------- #

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
    if len(text) > 80 or _EXCLUDE_HOSPITAL.search(text):
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


# --------------------------------------------------------------------------- #
# 1. MOH weekly Excel files
# --------------------------------------------------------------------------- #

def find_xlsx_links(html: str, base_url: str) -> list[str]:
    """Return every absolute .xlsx/.xls link on a page, in page order and without duplicates."""
    soup = BeautifulSoup(html, "lxml")
    links: list[str] = []
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if re.search(r"\.xlsx?(?:$|[?#])", href, re.I) or "xlsx" in href.lower():
            absolute = urljoin(base_url, href)
            if absolute not in links:
                links.append(absolute)
    return links


def resolve_moh_page(http: PoliteHttp, cfg: dict[str, Any]) -> Optional[str]:
    """Use the configured page URL. If it has moved, search the index page by link text."""
    if http.get(cfg["url"]) is not None:
        return cfg["url"]
    LOG.info("Configured MOH URL failed; searching index for %s", cfg["keywords"])
    html = http.get_text(MOH_INDEX_URL)
    if not html:
        return None
    soup = BeautifulSoup(html, "lxml")
    for a in soup.find_all("a", href=True):
        text = a.get_text(" ", strip=True).lower()
        if any(k in text for k in cfg["keywords"]):
            return urljoin(MOH_INDEX_URL, a["href"])
    LOG.warning("Could not locate MOH page for %s", cfg["keywords"])
    return None


def _detect_unit(text: str) -> Optional[str]:
    t = text.lower()
    if re.search(r"\bmin(ute)?s?\b|\(min", t):
        return "minutes"
    if re.search(r"\bh(ou)?rs?\b|\bhours?\b|\(h", t):
        return "hours"
    return None


def _best_date_column(grid: pd.DataFrame, rows: Iterable[int], exclude: set[int],
                      default_year: int) -> Optional[int]:
    best, best_hits = None, 1
    rows = list(rows)
    for c in grid.columns:
        if c in exclude:
            continue
        hits = sum(1 for r in rows if to_date(grid.iat[r, c], default_year))
        if hits > best_hits:
            best, best_hits = c, hits
    return best


def extract_sheet_records(grid: pd.DataFrame, default_year: int) -> list[tuple[str, date, Any]]:
    """Find (hospital_code, date, raw_value) triples in a messy sheet.

    Tries three layouts in order:
      A. Hospitals across a header row, dates down a column (the most common MOH layout)
      B. Dates across a header row, hospitals down a column
      C. A long table: each row has a date cell, a hospital cell and a value
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
            recs = []
            for i in body:
                d = to_date(grid.iat[i, date_col], default_year)
                if d:
                    recs.extend((code, d, grid.iat[i, c]) for c, code in hosp_cols.items())
            if recs:
                return recs

    # Layout B
    for r in scan:
        date_cols = {c: to_date(grid.iat[r, c], default_year) for c in grid.columns}
        date_cols = {c: d for c, d in date_cols.items() if d}
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


def parse_moh_workbook(content: bytes, metric: str, source_file: str = "") -> pd.DataFrame:
    """Parse an MOH .xlsx (any sheet, any of the supported layouts) into tidy rows.

    metric="bed_waits"      -> columns: hospital_code, hospital_name, report_date, median_wait_hours
    metric="ed_attendances" -> columns: hospital_code, hospital_name, report_date, total_attendances
    """
    value_col = "median_wait_hours" if metric == "bed_waits" else "total_attendances"
    empty = pd.DataFrame(columns=["hospital_code", "hospital_name", "report_date", value_col, "source_file"])
    try:
        sheets = pd.read_excel(io.BytesIO(content), sheet_name=None, header=None, engine="openpyxl")
    except Exception as exc:  # corrupt file, HTML error page saved as .xlsx, etc.
        LOG.warning("Cannot open workbook %s: %s", source_file, exc)
        return empty

    frames = []
    for sheet_name, grid in sheets.items():
        header_text = f"{sheet_name} " + " ".join(
            str(v) for v in grid.head(12).to_numpy().ravel() if not is_blank(v))
        year_match = re.search(r"\b(20\d{2})\b", header_text)
        default_year = int(year_match.group(1)) if year_match else datetime.now(SGT).year
        recs = extract_sheet_records(grid, default_year)
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
        frames.append(df[["hospital_code", "report_date", value_col]])

    if not frames:
        LOG.warning("No usable tables in %s", source_file)
        return empty
    out = pd.concat(frames, ignore_index=True)
    dropped = out[value_col].isna().sum()
    if dropped:
        LOG.info("%s: dropped %d unparseable cells", source_file or metric, dropped)
    out = out.dropna(subset=[value_col])
    out = out.drop_duplicates(subset=["hospital_code", "report_date"], keep="last")
    out["hospital_name"] = out["hospital_code"].map(lambda c: HOSPITALS[c][0])
    out["source_file"] = source_file
    return out[["hospital_code", "hospital_name", "report_date", value_col, "source_file"]] \
        .sort_values(["report_date", "hospital_code"]).reset_index(drop=True)


# --------------------------------------------------------------------------- #
# 2. Live wait-time pages
# --------------------------------------------------------------------------- #

_NUHS_LABELS = {
    "patients_waiting": re.compile(r"patients?\s+waiting", re.I),
    "est_consult_wait_hours": re.compile(r"(see|to)\s+(a\s+)?doctor|consult(ation)?\s+wait", re.I),
    "est_bed_wait_hours": re.compile(r"bed\s+wait", re.I),
}


def _cell_texts(tr) -> list[str]:
    return [c.get_text(" ", strip=True) for c in tr.find_all(["th", "td"])]


def _label_of(text: str) -> Optional[str]:
    for key, pattern in _NUHS_LABELS.items():
        if pattern.search(text):
            return key
    return None


def _nearest_heading(node) -> Optional[str]:
    h = node.find_previous(["h1", "h2", "h3", "h4", "h5", "strong"])
    return h.get_text(" ", strip=True) if h else None


def parse_nuhs_live(html: str) -> list[dict[str, Any]]:
    """Parse the NUHS ED wait-time page into one dict per site.

    Primary strategy: look for tables with label rows (patients waiting, time to
    see a doctor, bed wait) and site-name header rows.
    Fallback: regex over the visible text if the page has no usable tables.
    """
    soup = BeautifulSoup(html, "lxml")
    text = soup.get_text("\n", strip=True)
    updated = None
    m = re.search(r"last\s+updated\s+(?:at|on)?\s*:?\s*([0-9]{1,2}\s+\w+\s+\d{4},?\s+[0-9:]+\s*[AP]M)",
                  text, re.I)
    if m:
        ts = pd.to_datetime(m.group(1).replace(",", ""), dayfirst=True, errors="coerce")
        updated = None if pd.isna(ts) else ts.to_pydatetime().replace(microsecond=0)

    results: list[dict[str, Any]] = []
    for table in soup.find_all("table"):
        rows = [_cell_texts(tr) for tr in table.find_all("tr")]
        rows = [r for r in rows if any(r)]
        header = next((r for r in rows if not _label_of(" ".join(r)) and len(r) >= 2), None)
        metrics: dict[str, list[str]] = {}
        for r in rows:
            key = _label_of(r[0]) if r else None
            if key:
                metrics[key] = r[1:]
        if not metrics:
            continue
        n_cols = max(len(v) for v in metrics.values())
        heading = _nearest_heading(table) or "NUHS ED"
        for j in range(n_cols):
            if header and len(header) > j + 1 and header[j + 1]:
                site = header[j + 1]
            elif n_cols == 1:
                site = heading
            else:
                site = f"{heading} - site {j + 1}"
            rec = {"site_name": site, "patients_waiting": None,
                   "est_consult_wait_hours": None, "est_bed_wait_hours": None}
            for key, vals in metrics.items():
                cell = vals[j] if j < len(vals) else ""
                rec[key] = to_int(cell) if key == "patients_waiting" else parse_duration_hours(cell)
            if any(rec[k] is not None for k in _NUHS_LABELS):
                results.append(rec)

    if not results:  # fallback: plain-text regex
        results = _parse_nuhs_text(text)
    for r in results:
        r["source_updated_at"] = updated
    return results


def _parse_nuhs_text(text: str) -> list[dict[str, Any]]:
    """Text fallback: read 'Number of Patients Waiting ... 4 patient(s) 15 patient(s)' style lines."""
    flat = re.sub(r"\s+", " ", text)
    spans = []
    for key, pattern in _NUHS_LABELS.items():
        for m in pattern.finditer(flat):
            spans.append((m.start(), m.end(), key))
    spans.sort()
    sites: dict[int, dict[str, Any]] = {}
    for idx, (_, end, key) in enumerate(spans):
        stop = spans[idx + 1][0] if idx + 1 < len(spans) else min(len(flat), end + 200)
        segment = flat[end:stop]
        if key == "patients_waiting":
            values = [int(x) for x in re.findall(r"(\d+)\s*patient", segment, re.I)]
        else:
            values = [parse_duration_hours(x) for x in
                      re.findall(r"\d+(?:\.\d+)?\s*(?:hour|hr|min)[a-z()]*(?:\s*\d+\s*min[a-z()]*)?",
                                 segment, re.I)]
        for j, v in enumerate(values):
            rec = sites.setdefault(j, {"site_name": f"NUHS site {j + 1}", "patients_waiting": None,
                                       "est_consult_wait_hours": None, "est_bed_wait_hours": None})
            if rec[key] is None:
                rec[key] = v
    return list(sites.values())


def parse_singhealth_qwatch(html: str) -> list[dict[str, Any]]:
    """Parse SingHealth X-ray QWatch tables: site | total waiting time (minutes) or CLOSED."""
    soup = BeautifulSoup(html, "lxml")
    out: list[dict[str, Any]] = []
    for table in soup.find_all("table"):
        group = None
        for tr in table.find_all("tr"):
            cells = _cell_texts(tr)
            if len(cells) < 2:
                continue
            name, value = cells[0], cells[1]
            if re.search(r"waiting\s+time", value, re.I):   # header row names the group
                group = name
                continue
            if not name or set(name) <= {"-"}:
                continue
            status = value.strip().upper() or "N/A"
            minutes = to_int(value) if re.search(r"\d", value) else None
            out.append({"site_group": group or _nearest_heading(table), "site_name": name,
                        "wait_minutes": minutes,
                        "status": "OPEN" if minutes is not None else status})
    return out


# --------------------------------------------------------------------------- #
# 3. data.gov.sg and SingStat
# --------------------------------------------------------------------------- #

def fetch_datagov_dataset(http: PoliteHttp, dataset_id: str) -> Optional[bytes]:
    """Download a data.gov.sg dataset using the initiate/poll-download flow."""
    headers = {"x-api-key": DATAGOV_API_KEY} if DATAGOV_API_KEY else None
    poll = f"{DATAGOV_BASE}/{dataset_id}/poll-download"
    for attempt in range(5):
        payload = http.get_json(poll, headers=headers, check_robots=False)
        url = (payload or {}).get("data", {}).get("url") if isinstance(payload, dict) else None
        if url:
            return http.get_bytes(url, check_robots=False)
        if attempt == 0:  # ask the API to prepare the file, then poll again
            http.get_json(f"{DATAGOV_BASE}/{dataset_id}/initiate-download",
                          headers=headers, check_robots=False)
        time.sleep(3)
    LOG.warning("data.gov.sg dataset %s: no download URL after polling", dataset_id)
    return None


def _html_table_to_dict(html: str) -> dict[str, str]:
    """data.gov.sg KML-style GeoJSON hides attributes inside a <th>KEY</th><td>VAL</td> table."""
    soup = BeautifulSoup(html, "lxml")
    out = {}
    for tr in soup.find_all("tr"):
        th, td = tr.find("th"), tr.find("td")
        if th and td:
            out[th.get_text(strip=True).upper()] = td.get_text(" ", strip=True)
    return out


def parse_datagov_payload(content: bytes) -> pd.DataFrame:
    """Turn a data.gov.sg download (GeoJSON, JSON records or CSV) into a flat DataFrame."""
    text = content.decode("utf-8-sig", errors="replace").strip()
    if text.startswith("{") or text.startswith("["):
        data = json.loads(text)
        if isinstance(data, dict) and data.get("type") == "FeatureCollection":
            rows = []
            for feat in data.get("features", []):
                props = {str(k).upper(): v for k, v in (feat.get("properties") or {}).items()}
                desc = props.pop("DESCRIPTION", None)
                if isinstance(desc, str) and "<t" in desc.lower():
                    props.update(_html_table_to_dict(desc))
                geom = feat.get("geometry") or {}
                if geom.get("type") == "Point" and len(geom.get("coordinates", [])) >= 2:
                    props["_LON"], props["_LAT"] = geom["coordinates"][0], geom["coordinates"][1]
                rows.append(props)
            return pd.DataFrame(rows)
        records = data.get("result", {}).get("records") if isinstance(data, dict) else data
        return pd.DataFrame(records or [])
    return pd.read_csv(io.StringIO(text))


def _first(row: pd.Series, candidates: list[str]) -> Optional[str]:
    for c in candidates:
        if c in row and not is_blank(row[c]):
            v = str(row[c]).strip()
            if not re.fullmatch(r"kml_\d+", v, re.I):   # GeoJSON placeholder names
                return v
    return None


def normalize_clinics(raw: pd.DataFrame) -> pd.DataFrame:
    """Map whatever column names the source uses onto one clinic schema."""
    raw = raw.rename(columns=lambda c: str(c).strip().upper())
    out = []
    for _, row in raw.iterrows():
        name = _first(row, ["HCI_NAME", "CLINIC_NAME", "NAME_OF_CLINIC", "CLINIC", "NAME"])
        address = _first(row, ["ADDRESS", "ADDR", "FULL_ADDRESS", "FORMATTED_ADDRESS"])
        if not address:
            parts = [_first(row, ["BLK_HSE_NO", "BLOCK"]), _first(row, ["STREET_NAME", "STREET"]),
                     _first(row, ["FLOOR_NO"]) and f"#{_first(row, ['FLOOR_NO'])}-{_first(row, ['UNIT_NO']) or ''}",
                     _first(row, ["BUILDING_NAME"])]
            address = " ".join(p for p in parts if p) or None
        postal = _first(row, ["POSTAL_CD", "POSTAL_CODE", "POSTALCODE", "ADDRESSPOSTALCODE", "POSTAL"])
        if not postal and address:
            m = re.search(r"\b(\d{6})\b", address)
            postal = m.group(1) if m else None
        if postal and re.fullmatch(r"\d{5}", postal):
            postal = postal.zfill(6)                       # Excel/CSV drops leading zeros
        lat = _first(row, ["_LAT", "LATITUDE", "LAT", "Y"])
        lon = _first(row, ["_LON", "LONGITUDE", "LNG", "LON", "X"])
        programmes = _first(row, ["CLINIC_PROGRAMME_CODE", "PROGRAMME_CODE", "PROGRAMMES",
                                  "PROGRAMME", "HEALTH_PROGRAMMES"])
        hci = _first(row, ["HCI_CODE", "HCICODE"])
        out.append({
            "clinic_key": hci or f"{(name or '').upper()}|{postal or ''}",
            "clinic_name": name, "hci_code": hci, "address": address, "postal_code": postal,
            "latitude": pd.to_numeric(lat, errors="coerce"),
            "longitude": pd.to_numeric(lon, errors="coerce"),
            "programmes": programmes,
            "has_cdmp": None if programmes is None else ("CDMP" in programmes.upper()),
            # Full source row kept for has_clinics (column lists differ between datasets)
            "raw_json": json.dumps({k: (None if is_blank(v) else str(v)) for k, v in row.items()}),
        })
    df = pd.DataFrame(out)
    if df.empty:
        return df
    df = df[df["clinic_name"].notna()]
    return df.drop_duplicates(subset=["clinic_key"], keep="last").reset_index(drop=True)


def parse_singstat_tabledata(payload: dict, table_id: str) -> pd.DataFrame:
    """Flatten SingStat Table Builder JSON (it can be nested several levels deep)."""
    data = payload.get("Data") or payload.get("data") or {}
    rows = data.get("row") or data.get("rows") or []
    out = []

    def walk(columns: list, path: list[str], row_label: str) -> None:
        for col in columns or []:
            key = str(col.get("key", "")).strip()
            if "columns" in col and col["columns"]:
                walk(col["columns"], path + [key], row_label)
            else:
                out.append({"table_id": table_id, "row_label": row_label,
                            "column_path": " | ".join(path + [key]),
                            "value": pd.to_numeric(str(col.get("value", "")).replace(",", ""),
                                                   errors="coerce")})

    for row in rows:
        label = str(row.get("rowText", row.get("seriesNo", ""))).strip()
        walk(row.get("columns", []), [], label)
    return pd.DataFrame(out)


def derive_pop65(singstat: pd.DataFrame, title_year: Optional[int] = None) -> pd.DataFrame:
    """Best effort: sum age bands starting at 65+ for each planning area and year.

    Assumes rows are planning areas and a column-path segment is an age band such as
    '65 - 69' or '90 & Over'. Check the output against the source table.
    """
    recs = []
    for _, r in singstat.iterrows():
        segs = r["column_path"].split(" | ")
        age_lb = next((int(m.group(1)) for s in segs if (m := re.match(r"^(\d{1,3})\b", s))
                       and not re.fullmatch(r"(19|20)\d{2}", s)), None)
        year = next((int(s) for s in segs if re.fullmatch(r"(19|20)\d{2}", s)), title_year)
        if age_lb is not None and age_lb >= 65 and not pd.isna(r["value"]):
            recs.append((r["row_label"], year, r["value"]))
    if not recs:
        return pd.DataFrame(columns=["planning_area", "year", "residents_65plus"])
    df = pd.DataFrame(recs, columns=["planning_area", "year", "residents_65plus"])
    df = df[~df["planning_area"].str.lower().isin({"total", "all"})]
    return df.groupby(["planning_area", "year"], as_index=False, dropna=False)["residents_65plus"].sum()


# --------------------------------------------------------------------------- #
# DuckDB warehouse
# --------------------------------------------------------------------------- #

DDL = [
    """CREATE TABLE IF NOT EXISTS moh_bed_waits (
        hospital_name VARCHAR NOT NULL, report_date DATE NOT NULL,
        median_wait_hours DOUBLE, hospital_code VARCHAR, source_file VARCHAR,
        ingested_at TIMESTAMP NOT NULL, PRIMARY KEY (hospital_name, report_date))""",
    """CREATE TABLE IF NOT EXISTS moh_ed_attendances (
        hospital_name VARCHAR NOT NULL, report_date DATE NOT NULL,
        total_attendances BIGINT, hospital_code VARCHAR, source_file VARCHAR,
        ingested_at TIMESTAMP NOT NULL, PRIMARY KEY (hospital_name, report_date))""",
    """CREATE TABLE IF NOT EXISTS chas_clinics (
        clinic_key VARCHAR PRIMARY KEY, clinic_name VARCHAR, address VARCHAR,
        postal_code VARCHAR, latitude DOUBLE, longitude DOUBLE, has_cdmp BOOLEAN,
        hci_code VARCHAR, programmes VARCHAR, is_active BOOLEAN, ingested_at TIMESTAMP NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS has_clinics (
        clinic_key VARCHAR PRIMARY KEY, clinic_name VARCHAR, address VARCHAR,
        postal_code VARCHAR, latitude DOUBLE, longitude DOUBLE, raw_json VARCHAR,
        is_active BOOLEAN, ingested_at TIMESTAMP NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS nuhs_live_waits (
        site_name VARCHAR NOT NULL, patients_waiting INTEGER, est_bed_wait_hours DOUBLE,
        est_consult_wait_hours DOUBLE, source_updated_at TIMESTAMP,
        snapshot_timestamp TIMESTAMP NOT NULL, PRIMARY KEY (site_name, snapshot_timestamp))""",
    """CREATE TABLE IF NOT EXISTS singhealth_xray_waits (
        site_group VARCHAR, site_name VARCHAR NOT NULL, wait_minutes INTEGER, status VARCHAR,
        snapshot_timestamp TIMESTAMP NOT NULL, PRIMARY KEY (site_name, snapshot_timestamp))""",
    """CREATE TABLE IF NOT EXISTS singstat_tabledata (
        table_id VARCHAR NOT NULL, row_label VARCHAR NOT NULL, column_path VARCHAR NOT NULL,
        value DOUBLE, ingested_at TIMESTAMP NOT NULL,
        PRIMARY KEY (table_id, row_label, column_path))""",
    """CREATE TABLE IF NOT EXISTS pop_65plus_by_area (
        planning_area VARCHAR NOT NULL, year INTEGER NOT NULL, residents_65plus BIGINT,
        source_table VARCHAR, ingested_at TIMESTAMP NOT NULL, PRIMARY KEY (planning_area, year))""",
    """CREATE TABLE IF NOT EXISTS ingestion_log (
        sha256 VARCHAR PRIMARY KEY, source VARCHAR, url VARCHAR,
        fetched_at TIMESTAMP, rows_loaded INTEGER)""",
]


class Warehouse:
    """A thin DuckDB layer: creates the schema, upserts idempotently and records file hashes."""

    def __init__(self, path: str | Path) -> None:
        import duckdb  # imported here so the parsers can be unit-tested without DuckDB
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.con = duckdb.connect(str(path))
        for stmt in DDL:
            self.con.execute(stmt)

    def _column_types(self, table: str) -> dict[str, str]:
        rows = self.con.execute(
            "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = ?",
            [table]).fetchall()
        return {name: dtype for name, dtype in rows}

    def upsert(self, table: str, df: pd.DataFrame, keys: list[str]) -> int:
        """INSERT OR REPLACE on the primary key. Re-running never creates duplicate rows."""
        if df is None or df.empty:
            return 0
        types = self._column_types(table)
        cols = [c for c in df.columns if c in types]
        df = df[cols].drop_duplicates(subset=keys, keep="last")
        select = ", ".join(f'CAST("{c}" AS {types[c]}) AS "{c}"' for c in cols)
        col_list = ", ".join(f'"{c}"' for c in cols)
        self.con.register("_staging", df)
        try:
            self.con.execute(f"INSERT OR REPLACE INTO {table} ({col_list}) SELECT {select} FROM _staging")
        finally:
            self.con.unregister("_staging")
        return len(df)

    def seen(self, digest: str) -> bool:
        return self.con.execute("SELECT 1 FROM ingestion_log WHERE sha256 = ?", [digest]).fetchone() is not None

    def log_file(self, digest: str, source: str, url: str, rows: int) -> None:
        self.con.execute("INSERT OR REPLACE INTO ingestion_log VALUES (?, ?, ?, ?, ?)",
                         [digest, source, url, now_sgt(), rows])

    def mark_inactive(self, table: str) -> None:
        """Before loading a full snapshot, flag every row inactive; the reload re-activates current ones."""
        self.con.execute(f"UPDATE {table} SET is_active = FALSE")

    def query(self, sql: str) -> pd.DataFrame:
        return self.con.execute(sql).df()

    def close(self) -> None:
        self.con.execute("CHECKPOINT")  # flush the WAL so the .duckdb file is complete before git commit
        self.con.close()


# --------------------------------------------------------------------------- #
# Ingestion steps
# --------------------------------------------------------------------------- #

def ingest_moh_file(wh: Warehouse, metric: str, content: bytes, url: str, force: bool = False) -> int:
    """Parse and upsert one MOH workbook. Skips files whose hash is already loaded."""
    digest = sha256(content)
    if not force and wh.seen(digest):
        LOG.info("MOH %s: %s already ingested (same hash), skipping", metric, url)
        return 0
    df = parse_moh_workbook(content, metric, source_file=url.rsplit("/", 1)[-1])
    df["ingested_at"] = now_sgt()
    n = wh.upsert(MOH_SOURCES[metric]["table"], df, ["hospital_name", "report_date"])
    wh.log_file(digest, f"moh_{metric}", url, n)
    if n:
        LOG.info("MOH %s: %d rows (%s to %s) from %s", metric, n,
                 df["report_date"].min(), df["report_date"].max(), url)
    return n


def ingest_moh(http: PoliteHttp, wh: Warehouse, force: bool = False) -> int:
    total = 0
    for metric, cfg in MOH_SOURCES.items():
        page = resolve_moh_page(http, cfg)
        html = http.get_text(page) if page else None
        if not html:
            continue
        links = find_xlsx_links(html, page)
        if not links:
            LOG.warning("MOH %s: no .xlsx link found on %s (page layout may have changed)", metric, page)
        for link in links:
            content = http.get_bytes(link)
            if content:
                total += ingest_moh_file(wh, metric, content, link, force)
    return total


def ingest_live(http: PoliteHttp, wh: Warehouse) -> int:
    total = 0
    snap = now_sgt().replace(second=0)

    html = http.get_text(NUHS_LIVE_URL)
    rows = parse_nuhs_live(html) if html else []
    if not rows:
        LOG.info("NUHS: no data in static HTML, trying the JS-rendered page")
        rendered = render_with_playwright(NUHS_LIVE_URL)
        rows = parse_nuhs_live(rendered) if rendered else []
    if rows:
        df = pd.DataFrame(rows)
        # Use the page's own "last updated" time as the snapshot key, so repeated
        # runs between page updates don't create duplicate rows.
        df["snapshot_timestamp"] = df["source_updated_at"].fillna(snap) \
            if "source_updated_at" in df else snap
        total += wh.upsert("nuhs_live_waits", df, ["site_name", "snapshot_timestamp"])
    else:
        LOG.warning("NUHS: could not parse any wait-time rows")

    html = http.get_text(SINGHEALTH_QWATCH_URL)
    rows = parse_singhealth_qwatch(html) if html else []
    if not rows:
        rendered = render_with_playwright(SINGHEALTH_QWATCH_URL)
        rows = parse_singhealth_qwatch(rendered) if rendered else []
    if rows:
        df = pd.DataFrame(rows)
        df["snapshot_timestamp"] = snap
        total += wh.upsert("singhealth_xray_waits", df, ["site_name", "snapshot_timestamp"])
    else:
        LOG.warning("SingHealth QWatch: could not parse any rows")
    return total


def ingest_opendata(http: PoliteHttp, wh: Warehouse) -> int:
    total = 0
    for key, table in (("chas", "chas_clinics"), ("has", "has_clinics")):
        content = fetch_datagov_dataset(http, DATAGOV_DATASETS[key])
        if not content:
            continue
        raw = parse_datagov_payload(content)
        df = normalize_clinics(raw)
        if df.empty:
            LOG.warning("data.gov.sg %s: no clinics parsed (columns: %s)", key, list(raw.columns)[:15])
            continue
        df["is_active"] = True
        df["ingested_at"] = now_sgt()
        wh.mark_inactive(table)
        n = wh.upsert(table, df, ["clinic_key"])
        LOG.info("data.gov.sg %s: %d clinics", key, n)
        total += n
    return total


def ingest_singstat(http: PoliteHttp, wh: Warehouse, table_id: Optional[str]) -> int:
    if not table_id:
        LOG.info("SingStat: no table ID set (SINGSTAT_POP_TABLE_ID or --singstat-table), skipping")
        return 0
    payload = http.get_json(SINGSTAT_URL.format(table_id=table_id), check_robots=False,
                            headers={"Accept": "application/json"})
    if not isinstance(payload, dict):
        return 0
    flat = parse_singstat_tabledata(payload, table_id)
    flat["ingested_at"] = now_sgt()
    n = wh.upsert("singstat_tabledata", flat, ["table_id", "row_label", "column_path"])
    title = str((payload.get("Data") or {}).get("title", ""))
    ym = re.search(r"(19|20)\d{2}", title)
    pop = derive_pop65(flat, int(ym.group(0)) if ym else None)
    if not pop.empty:
        pop["source_table"] = table_id
        pop["ingested_at"] = now_sgt()
        pop = pop.dropna(subset=["year"])
        wh.upsert("pop_65plus_by_area", pop, ["planning_area", "year"])
    LOG.info("SingStat %s: %d cells, %d planning-area rows", table_id, n, len(pop))
    return n


# --------------------------------------------------------------------------- #
# Wayback Machine backfill
# --------------------------------------------------------------------------- #

def wayback_snapshots(http: PoliteHttp, url: str, start: str, end: str) -> list[tuple[str, str]]:
    """Return a list of (timestamp, original_url) captures from the Internet Archive CDX API."""
    params = {"url": url, "output": "json", "from": start.replace("-", ""),
              "to": end.replace("-", ""), "filter": "statuscode:200", "collapse": "digest"}
    data = http.get_json("https://web.archive.org/cdx/search/cdx", params=params,
                         delay=ARCHIVE_DELAY, check_robots=False)
    if not data or len(data) < 2:
        return []
    header = data[0]
    i_ts, i_orig = header.index("timestamp"), header.index("original")
    return [(row[i_ts], row[i_orig]) for row in data[1:]]


def backfill_moh(http: PoliteHttp, wh: Warehouse, start: str, end: str,
                 max_snapshots: int, force: bool = False) -> int:
    """Rebuild history from archived copies of the MOH pages and their linked .xlsx files."""
    total = 0
    for metric, cfg in MOH_SOURCES.items():
        snaps: list[tuple[str, str]] = []
        for page_url in [cfg["url"], *cfg.get("legacy_urls", [])]:
            snaps += wayback_snapshots(http, page_url, start, end)
        snaps = sorted(set(snaps))[-max_snapshots:]
        LOG.info("Backfill %s: %d archived page captures", metric, len(snaps))
        for ts, original in snaps:
            html = http.get_text(f"https://web.archive.org/web/{ts}id_/{original}",
                                 delay=ARCHIVE_DELAY, check_robots=False)
            if not html:
                continue
            for link in find_xlsx_links(html, original):
                # Prefer the archived copy: MOH may reuse file names for newer data.
                content = (http.get_bytes(f"https://web.archive.org/web/{ts}id_/{link}",
                                          delay=ARCHIVE_DELAY, check_robots=False)
                           or http.get_bytes(link))
                if content and content[:2] == b"PK":   # .xlsx files are zip archives
                    total += ingest_moh_file(wh, metric, content, link, force)
    return total


# --------------------------------------------------------------------------- #
# Excel report (openpyxl)
# --------------------------------------------------------------------------- #

HEADER_FILL = "1F4E79"
STRIPE_FILL = "F2F4F7"


def _excel_safe(v: Any) -> Any:
    if is_blank(v) and not isinstance(v, str):
        return None
    if isinstance(v, pd.Timestamp):
        v = v.to_pydatetime()
    if isinstance(v, datetime) and v.tzinfo is not None:
        v = v.replace(tzinfo=None)
    if hasattr(v, "item") and not isinstance(v, (str, bytes)):   # numpy scalars
        try:
            return v.item()
        except (ValueError, AttributeError):
            pass
    return v


def build_excel_report(sheets: dict[str, pd.DataFrame], path: str | Path) -> Path:
    """Write the formatted report: navy header, filters, stripes, frozen header and auto-fit widths."""
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter

    wb = Workbook()
    wb.remove(wb.active)
    header_fill = PatternFill("solid", start_color=HEADER_FILL, end_color=HEADER_FILL)
    stripe_fill = PatternFill("solid", start_color=STRIPE_FILL, end_color=STRIPE_FILL)

    for name, df in sheets.items():
        ws = wb.create_sheet(title=name[:31])
        df = df if df is not None and not df.empty else pd.DataFrame({"status": ["No data yet"]})
        ws.append([str(c) for c in df.columns])
        for row in df.itertuples(index=False):
            ws.append([_excel_safe(v) for v in row])

        widths = {i: len(str(c)) for i, c in enumerate(df.columns, start=1)}
        for r_idx, row in enumerate(ws.iter_rows(), start=1):
            for cell in row:
                if r_idx == 1:
                    cell.fill = header_fill
                    cell.font = Font(bold=True, color="FFFFFF")
                    cell.alignment = Alignment(horizontal="center", vertical="center")
                    continue
                if r_idx % 2 == 0:
                    cell.fill = stripe_fill
                if isinstance(cell.value, datetime):
                    cell.number_format = "yyyy-mm-dd hh:mm" if (cell.value.hour or cell.value.minute) \
                        else "yyyy-mm-dd"
                elif isinstance(cell.value, date):
                    cell.number_format = "yyyy-mm-dd"
                elif isinstance(cell.value, float):
                    cell.number_format = "0.00"
                shown = cell.value.strftime("%Y-%m-%d %H:%M") if isinstance(cell.value, datetime) \
                    else "" if cell.value is None else str(cell.value)
                widths[cell.column] = max(widths.get(cell.column, 0), len(shown))
        for col, w in widths.items():
            ws.column_dimensions[get_column_letter(col)].width = min(w + 4, 80)
        ws.auto_filter.ref = ws.dimensions
        ws.freeze_panes = "A2"

    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(path)
    return path


def export_report(wh: Warehouse, path: str | Path) -> Path:
    summary = wh.query("""
        SELECT COALESCE(b.report_date, a.report_date)     AS report_date,
               COALESCE(b.hospital_name, a.hospital_name) AS hospital_name,
               b.median_wait_hours, a.total_attendances
        FROM moh_bed_waits b
        FULL OUTER JOIN moh_ed_attendances a
          ON a.hospital_name = b.hospital_name AND a.report_date = b.report_date
        ORDER BY report_date DESC, hospital_name""")
    chas = wh.query("""
        SELECT clinic_name, address, postal_code, latitude, longitude, has_cdmp, programmes, ingested_at
        FROM chas_clinics WHERE is_active ORDER BY clinic_name""")
    live = wh.query("""
        SELECT snapshot_timestamp, site_name, patients_waiting, est_consult_wait_hours, est_bed_wait_hours
        FROM nuhs_live_waits ORDER BY snapshot_timestamp DESC, site_name LIMIT 5000""")
    out = build_excel_report({"MOH_Weekly_Summary": summary, "CHAS_Clinic_Directory": chas,
                              "NUHS_Live_Snapshots": live}, path)
    LOG.info("Report written to %s", out)
    return out


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #

ALL_SOURCES = ("moh", "live", "opendata", "singstat")


def _run_step(name: str, fn, *args) -> int:
    try:
        return fn(*args)
    except Exception:  # one broken source must not stop the others
        LOG.exception("Step %s failed", name)
        return -1


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Singapore healthcare capacity ETL pipeline")
    parser.add_argument("--db", default="singapore_healthcare.duckdb")
    parser.add_argument("--report", default="SG_Healthcare_Scrape_Report.xlsx")
    parser.add_argument("-v", "--verbose", action="store_true")
    sub = parser.add_subparsers(dest="command", required=True)

    run = sub.add_parser("run", help="scrape sources, load DuckDB, write the Excel report")
    run.add_argument("--sources", default=",".join(ALL_SOURCES),
                     help=f"comma-separated subset of {ALL_SOURCES}")
    run.add_argument("--force", action="store_true", help="re-parse files even if the hash was seen")
    run.add_argument("--singstat-table", default=SINGSTAT_POP_TABLE_ID)
    run.add_argument("--no-report", action="store_true")

    bf = sub.add_parser("backfill", help="load historical MOH files from the Wayback Machine")
    bf.add_argument("--start", default="2023-01-01")
    bf.add_argument("--end", default=date.today().isoformat())
    bf.add_argument("--max-snapshots", type=int, default=60, help="per metric, newest first")
    bf.add_argument("--force", action="store_true")

    sub.add_parser("report", help="rebuild the Excel report from the warehouse only")

    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO,
                        format="%(asctime)s %(levelname)-7s %(message)s", datefmt="%H:%M:%S")

    wh = Warehouse(args.db)
    http = PoliteHttp()
    results: dict[str, int] = {}
    try:
        if args.command == "run":
            wanted = {s.strip() for s in args.sources.split(",") if s.strip()}
            unknown = wanted - set(ALL_SOURCES)
            if unknown:
                parser.error(f"unknown sources: {sorted(unknown)}")
            if "moh" in wanted:
                results["moh"] = _run_step("moh", ingest_moh, http, wh, args.force)
            if "live" in wanted:
                results["live"] = _run_step("live", ingest_live, http, wh)
            if "opendata" in wanted:
                results["opendata"] = _run_step("opendata", ingest_opendata, http, wh)
            if "singstat" in wanted:
                results["singstat"] = _run_step("singstat", ingest_singstat, http, wh, args.singstat_table)
            if not args.no_report:
                export_report(wh, args.report)
        elif args.command == "backfill":
            results["backfill"] = _run_step("backfill", backfill_moh, http, wh, args.start, args.end,
                                            args.max_snapshots, args.force)
            export_report(wh, args.report)
        else:
            export_report(wh, args.report)
    finally:
        wh.close()

    LOG.info("Summary (rows upserted, -1 = failed): %s", results)
    # Exit with 1 only if every step failed, so partial data still gets committed in CI.
    return 1 if results and all(v < 0 for v in results.values()) else 0


if __name__ == "__main__":
    sys.exit(main())
