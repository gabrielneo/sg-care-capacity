"""MOH weekly Excel files: find the download page, fetch each workbook, load it."""
from __future__ import annotations

import logging
from typing import Any, Optional
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from ..config import MOH_INDEX_URL, MOH_SOURCES, now_sgt
from ..http import PoliteHttp
from ..parsers.common import sha256
from ..parsers.moh import find_xlsx_links, parse_moh_workbook
from ..warehouse import Warehouse

LOG = logging.getLogger(__name__)


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
