"""Historical MOH backfill from archived copies on the Internet Archive (Wayback Machine).

Wayback is a way of fetching, not a source of its own: an archived workbook lands
under the same raw source as a live one (e.g. ``moh_bed_waits``), with its archive
URL, so identical files are recognised by sha256 whichever way they arrived.
"""
from __future__ import annotations

import logging

from ..config import ARCHIVE_DELAY, MOH_SOURCES
from ..http import PoliteHttp
from ..load import Loader
from ..parsers.moh import find_xlsx_links

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


def backfill_moh(http: PoliteHttp, loader: Loader, start: str, end: str, max_snapshots: int) -> int:
    """Rebuild history from archived copies of the MOH pages and their linked .xlsx files."""
    store = loader.store
    total = 0
    for metric, cfg in MOH_SOURCES.items():
        snaps: list[tuple[str, str]] = []
        for page_url in [cfg["url"], *cfg.get("legacy_urls", [])]:
            snaps += wayback_snapshots(http, page_url, start, end)
        snaps = sorted(set(snaps))[-max_snapshots:]
        LOG.info("Backfill %s: %d archived page captures", metric, len(snaps))
        for ts, original in snaps:
            page_url = f"https://web.archive.org/web/{ts}id_/{original}"
            resp = http.get(page_url, delay=ARCHIVE_DELAY, check_robots=False)
            if resp is None:
                continue
            store.save_response("moh_page", page_url, resp)
            for link in find_xlsx_links(resp.text, original):
                # Prefer the archived copy: MOH may reuse file names for newer data.
                archived = f"https://web.archive.org/web/{ts}id_/{link}"
                got_url, file_resp = archived, http.get(archived, delay=ARCHIVE_DELAY, check_robots=False)
                if file_resp is None:
                    got_url, file_resp = link, http.get(link)
                if file_resp is not None:
                    total += loader.process(store.save_response(cfg["table"], got_url, file_resp))
    return total
