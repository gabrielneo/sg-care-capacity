"""SingStat: residents by planning area, age group, sex and type of dwelling (annual file)."""
from __future__ import annotations

import logging

from ..config import SINGSTAT_RESIDENTS_URL
from ..http import PoliteHttp
from ..load import Loader

LOG = logging.getLogger(__name__)


def ingest_singstat(http: PoliteHttp, loader: Loader) -> int:
    resp = http.get(SINGSTAT_RESIDENTS_URL)          # robots.txt allows it (Crawl-delay 2; we wait >= 1.5-3 s)
    if resp is None:
        return 0
    return loader.process(loader.store.save_response("singstat_residents", SINGSTAT_RESIDENTS_URL, resp))
