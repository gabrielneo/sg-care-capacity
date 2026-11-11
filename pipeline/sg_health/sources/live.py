"""Live wait-time pages: polite snapshots of the NUHS ED wait-time page.

The NUHS page carries its figures in the static HTML, so no browser is needed. (A Playwright
fallback for JavaScript-rendered pages was removed on 2026-11-11: it was last needed for
SingHealth's retired QWatch page.)"""
from __future__ import annotations

import logging

from ..config import NUHS_LIVE_URL
from ..http import PoliteHttp
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
            LOG.warning("%s: could not parse any wait-time rows", label)
        total += n
    return total
