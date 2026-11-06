"""Configuration: source URLs, dataset IDs, the hospital list and environment variables.

All timestamps are stored in Singapore time (SGT, UTC+8, no DST), as naive
TIMESTAMP values.
"""
from __future__ import annotations

import os
import re
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

SGT = timezone(timedelta(hours=8))  # Singapore has no DST, so a fixed offset is safe

# Paths. Defaults are resolved from the repo root (this file is pipeline/sg_health/config.py),
# so commands behave the same from any working directory. SG_HEALTH_DATA_DIR overrides.
REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = Path(os.getenv("SG_HEALTH_DATA_DIR", REPO_ROOT / "data"))
RAW_DIR = DATA_DIR / "raw"                     # immutable landing zone (gitignored)
BUILD_DIR = DATA_DIR / "build"                 # working outputs (gitignored)
DEFAULT_DB = BUILD_DIR / "warehouse.duckdb"    # the pipeline's working DB, not what the API reads
DEFAULT_REPORT = BUILD_DIR / "SG_Healthcare_Scrape_Report.xlsx"

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

DATAGOV_BASE = "https://api-open.data.gov.sg/v1/public/api/datasets"
DATAGOV_DATASETS = {
    # CHAS Clinics (GeoJSON), the only dataset in data.gov.sg collection 2036. Verified
    # 2026-11-06; the previous ID d_65d11d02ab0246cec53bfc995c782628 now returns
    # DATASET_DOES_NOT_EXIST. If this breaks again, look the ID up from the collection:
    # https://api-production.data.gov.sg/v2/public/api/collections/2036/metadata
    "chas": "d_548c33ea2d99e29ec63a7cc9edcccedc",
    # MOH "Hospital Admissions And Public Sector Outpatient Attendances, Annual" (CSV:
    # year, level_1, value), 1984-2023 as of 2026-11-06. Used only to reconcile MOH's daily
    # ED attendances (data-quality check reconcile.annual_ae).
    "annual_ae": "d_a5267c58f60b20f8e04576261abfac93",
}
ANNUAL_AE_SERIES = "Accident & Emergency Departments"   # exact level_1 label in that CSV
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
    "WH":    ("Woodlands Hospital",            r"woodlands|\bwh\b"),
}
# Reference list for data-quality checks: facility type and the first day MOH reports it.
# valid_from=None means "from the start of MOH's published series" (2023-01-01).
# Sources: MOH Healthcare Institution Statistics pages and workbooks (checked 2026-11-06).
HOSPITAL_REFERENCE: dict[str, tuple[str, "date | None"]] = {
    "AH":    ("UCC", None),        # Urgent Care Centre, not a full ED
    "CGH":   ("ED", None),
    "KTPH":  ("ED", None),
    "NUH":   ("ED", None),         # adult ED only; NUH Children's is excluded by MOH
    "NTFGH": ("ED", None),
    "SKH":   ("ED", None),
    "SGH":   ("ED", None),
    "TTSH":  ("ED", None),
    "WH":    ("ED", date(2024, 6, 23)),   # first value in MOH's workbooks
}
EXCLUDE_HOSPITAL = re.compile(r"child|paediatric|pediatric|kk\s*women|\bkkh\b", re.I)


def now_sgt() -> datetime:
    """Current Singapore time as a naive datetime (what we store in DuckDB)."""
    return datetime.now(SGT).replace(tzinfo=None, microsecond=0)
