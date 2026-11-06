"""Historical MOH backfill from archived copies on the Internet Archive (Wayback Machine)."""
from __future__ import annotations

import logging

from ..config import ARCHIVE_DELAY, MOH_SOURCES
from ..http import PoliteHttp
from ..parsers.moh import find_xlsx_links
from ..warehouse import Warehouse
from .moh import ingest_moh_file

LOG = logging.getLogger(__name__)


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
