"""Live wait-time pages: polite snapshots of the NUHS ED wait-time page."""
from __future__ import annotations

import logging

from ..config import NUHS_LIVE_URL
from ..http import PoliteHttp, render_with_playwright
from ..load import Loader

LOG = logging.getLogger(__name__)

LIVE_PAGES = (("nuhs_live", NUHS_LIVE_URL, "NUHS"),)


def ingest_live(http: PoliteHttp, loader: Loader) -> int:
    total = 0
    for source, url, label in LIVE_PAGES:
        n = 0
        resp = http.get(url)
        if resp is not None:
            n = loader.process(loader.store.save_response(source, url, resp))
        if n == 0:
            LOG.info("%s: no data in static HTML, trying the JS-rendered page", label)
            rendered = render_with_playwright(url)
            if rendered:
                # A rendered page has no HTTP response of its own: http_status is left empty.
                rec = loader.store.save(source, url, rendered.encode("utf-8"), http_status=None,
                                        content_type="text/html; charset=utf-8")
                n = loader.process(rec)
        if n == 0:
            LOG.warning("%s: could not parse any wait-time rows", label)
        total += n
    return total
