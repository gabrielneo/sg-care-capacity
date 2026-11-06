"""Singapore healthcare capacity pipeline.

Collects only aggregate data about institutions, places and populations. No
personal or patient-level data.

Layout:
    config       source URLs, dataset IDs, hospitals, env vars
    http         polite HTTP client (retries, rate limit, robots.txt)
    parsers/     pure parsers: bytes/text in, rows out
    sources/     fetchers, one per upstream source
    warehouse    DuckDB schema and upserts
    report       Excel summary
    cli          `sg-health` command line
"""
from .parsers.datagov import normalize_clinics, parse_datagov_payload
from .parsers.live import parse_nuhs_live
from .parsers.moh import find_xlsx_links, parse_moh_workbook
from .parsers.singstat import parse_residents_zip
from .report import build_excel_report
from .warehouse import Warehouse

__all__ = [
    "Warehouse", "build_excel_report", "find_xlsx_links", "normalize_clinics",
    "parse_datagov_payload", "parse_moh_workbook", "parse_nuhs_live", "parse_residents_zip",
]
