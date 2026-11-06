"""MOH weekly Excel files: find the download page, land each workbook, load it."""
from __future__ import annotations

import logging
from typing import Any
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from ..config import MOH_INDEX_URL, MOH_SOURCES
from ..http import PoliteHttp
from ..load import Loader
from ..parsers.moh import find_xlsx_links

LOG = logging.getLogger(__name__)


def fetch_moh_page(http: PoliteHttp, loader: Loader, cfg: dict[str, Any]) -> tuple[str, str] | None:
    """Fetch and land the metric's page. If it has moved, search the index page by link text.

    Returns (page_url, html), or None if the page can't be found.
    """
    store = loader.store
    resp = http.get(cfg["url"])
    if resp is not None:
        store.save_response("moh_page", cfg["url"], resp)
        return cfg["url"], resp.text
    LOG.info("Configured MOH URL failed; searching index for %s", cfg["keywords"])
    resp = http.get(MOH_INDEX_URL)
    if resp is None:
        return None
    store.save_response("moh_page", MOH_INDEX_URL, resp)
    soup = BeautifulSoup(resp.text, "lxml")
    for a in soup.find_all("a", href=True):
        text = a.get_text(" ", strip=True).lower()
        href = a.get("href")
        if isinstance(href, str) and any(k in text for k in cfg["keywords"]):
            page = urljoin(MOH_INDEX_URL, href)
            resp = http.get(page)
            if resp is None:
                return None
            store.save_response("moh_page", page, resp)
            return page, resp.text
    LOG.warning("Could not locate MOH page for %s", cfg["keywords"])
    return None


def ingest_moh(http: PoliteHttp, loader: Loader) -> int:
    total = 0
    for metric, cfg in MOH_SOURCES.items():
        found = fetch_moh_page(http, loader, cfg)
        if not found:
            continue
        page, html = found
        links = find_xlsx_links(html, page)
        if not links:
            LOG.warning("MOH %s: no .xlsx link found on %s (page layout may have changed)", metric, page)
        for link in links:
            resp = http.get(link)
            if resp is not None:
                rec = loader.store.save_response(cfg["table"], link, resp)
                total += loader.process(rec)
    return total
