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


def load_local_env(path: Path | None = None) -> bool:
    """Load a local .env into os.environ if one exists (python-dotenv). Never required.

    override=False: a real environment variable always wins, e.g. CI's DATAGOV_API_KEY secret.
    Values are never logged. Returns True if a file was read.
    """
    from dotenv import load_dotenv
    path = path or REPO_ROOT / ".env"
    return path.is_file() and load_dotenv(path, override=False)


load_local_env()   # before any setting below is read
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
    "+https://github.com/gabrielneo/sg-care-capacity)",
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
    # URA "Master Plan 2025 Planning Area Boundary (No Sea)" (GeoJSON, 55 areas, WGS84), the
    # boundaries SingStat uses for June 2026. Names match SingStat's case-insensitively (checked
    # 2026-11-06, 55 of 55). Not the collection-2104 dataset, which is the 2019 edition.
    "planning_areas": "d_2cc750190544007400b2cfd5d7f53209",
    # HPB "Cervical Screening Centre" (GeoJSON, Jan 2026): used as the POLYCLINIC list, because
    # every polyclinic offers cervical screening and it lists all 26. A proxy, not a polyclinic
    # register: a polyclinic appears only once HPB lists it for screening. MOH's own
    # "Vaccination_Polyclinics" set has only 8 (a COVID-vaccination subset), so it isn't used.
    "polyclinics": "d_3ca2a28059588f297908b32da4ac3cbe",
}
ANNUAL_AE_SERIES = "Accident & Emergency Departments"   # exact level_1 label in that CSV
# Dataset metadata (name, publisher, lastUpdatedAt). lastUpdatedAt is the as_of shown to users
# for that dataset: the CHAS file, for instance, was last updated upstream on 2024-06-06.
DATAGOV_METADATA_URL = "https://api-production.data.gov.sg/v2/public/api/datasets/{dataset_id}/metadata"
DATAGOV_API_KEY = os.getenv("DATAGOV_API_KEY")      # optional, gives higher rate limits

# SingStat "Singapore Residents by Planning Area / Subzone, Age Group, Sex and Type of Dwelling,
# June 2026" (zip of CSVs), from the geographic distribution page below. Annual: update the URL
# when SingStat publishes June 2027 (around September).
# Why this file and not the "... and Floor Area of Residence" one listed first on the page: the
# floor-area file leaves out residents in the "Others" type of dwelling, 35,280 residents of whom
# 20,410 are aged 65+ (checked 2026-11-06), so it undercounts exactly the population we need.
SINGSTAT_RESIDENTS_URL = "https://www.singstat.gov.sg/files/c6755f50-4bfb-4bfa-b7d3-00259b9509ed.zip"
# The file is downloaded by hand once a year and committed under data/reference/singstat/ (small,
# public, open-licence). The pipeline reads ONLY this committed copy: SingStat refuses GitHub's
# runners (HTTP 403), and one reviewed file makes every run, local or CI, use identical inputs.
# SINGSTAT_RESIDENTS_URL is kept as its provenance (lineage records it with the file's hash).
# Yearly refresh: docs/runbook.md ("SingStat population, yearly refresh").
REFERENCE_DIR = REPO_ROOT / "data" / "reference"
SINGSTAT_RESIDENTS_FILE = REFERENCE_DIR / "singstat" / "respopagesextod2026.zip"
SINGSTAT_RESIDENTS_SHA256 = "09641d04b86723637867da4c89dd1a79cb9971d8db409e65986632e5e8484610"
SINGSTAT_RESIDENTS_PAGE = ("https://www.singstat.gov.sg/find-data/explore-data-themes/population/"
                           "geographic-distribution/latest-news-data")
EXPECTED_PLANNING_AREAS = 55     # URA Master Plan 2025, as used by SingStat for June 2026

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
HOSPITAL_REFERENCE: dict[str, tuple[str, date | None]] = {
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
# Public healthcare cluster of each site, and what MOH's figures for it cover.
# Clusters: SingHealth (SGH, CGH, SKH); NHG Health (TTSH, KTPH, WH; "NHG" was renamed NHG Health
# on 1 Jul 2025); NUHS (NUH, NTFGH, AH; AH has been run by NUHS since 1 Jun 2018). Membership has
# not changed since 2018, so one value per site is correct for MOH's series (2023 onward).
# Checked 2026-11-06 against NHG Health's corporate profile (nhghealth.com.sg/about-us), MOH's
# 2017 cluster reorganisation notice and the Alexandra Hospital and NHG Health records.
HOSPITAL_CLUSTER: dict[str, str] = {
    "SGH": "SingHealth", "CGH": "SingHealth", "SKH": "SingHealth",
    "TTSH": "NHG Health", "KTPH": "NHG Health", "WH": "NHG Health",
    "NUH": "NUHS", "NTFGH": "NUHS", "AH": "NUHS",
}
HOSPITAL_COVERAGE_NOTE: dict[str, str] = {
    "AH": "Urgent Care Centre at Alexandra Hospital, not a full emergency department.",
    "NUH": "Adult emergency department only; NUH Children's Emergency is excluded by MOH.",
    "WH": "MOH reports Woodlands Hospital from 2024-06-23; its page text does not list it yet.",
}
# Where each site is, for the map: postal code, latitude, longitude (WGS84, 6 dp, about 0.1 m).
# From SLA OneMap's search API (onemap.gov.sg/api/common/elastic/search?searchVal=<postal code>),
# checked 2026-11-09: each postal code returned a building with the site's own name. The point is
# that building's; SGH has no single building, so it is "SINGAPORE GENERAL HOSPITAL (BLK 1)", the
# block with the Emergency Department. A map pin, not a routing address.
HOSPITAL_LOCATION: dict[str, tuple[str, float, float]] = {
    "AH":    ("159964", 1.285481, 103.800181),
    "CGH":   ("529889", 1.340826, 103.949467),
    "KTPH":  ("768828", 1.424081, 103.838579),
    "NUH":   ("119074", 1.294420, 103.783687),
    "NTFGH": ("609606", 1.333606, 103.745448),
    "SKH":   ("544886", 1.394393, 103.893164),
    "SGH":   ("169608", 1.278429, 103.834043),
    "TTSH":  ("308433", 1.321369, 103.845694),
    "WH":    ("737628", 1.424681, 103.794744),
}
HOSPITAL_LOCATION_CHECKED = date(2026, 11, 9)
HOSPITAL_LOCATION_SOURCE_URL = "https://www.onemap.gov.sg/api/common/elastic/search"
MOH_EXCLUSIONS_NOTE = ("MOH excludes KK Women's and Children's Hospital and NUH Children's Emergency "
                       "from these statistics.")
REFERENCE_CHECKED = date(2026, 11, 6)       # when the hospital reference above was last verified
REFERENCE_SOURCE_URL = ("https://www.moh.gov.sg/others/resources-and-statistics/"
                        "healthcare-institution-statistics-waiting-time-for-admission-to-ward/")

EXCLUDE_HOSPITAL = re.compile(r"child|paediatric|pediatric|kk\s*women|\bkkh\b", re.I)


def now_sgt() -> datetime:
    """Current Singapore time as a naive datetime (what we store in DuckDB)."""
    return datetime.now(SGT).replace(tzinfo=None, microsecond=0)
