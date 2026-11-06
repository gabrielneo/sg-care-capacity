"""SingStat Table Builder: residents by planning area and age group."""
from __future__ import annotations

import logging
from typing import Optional

from ..config import SINGSTAT_URL
from ..http import PoliteHttp
from ..load import Loader

LOG = logging.getLogger(__name__)


def ingest_singstat(http: PoliteHttp, loader: Loader, table_id: Optional[str]) -> int:
    if not table_id:
        LOG.info("SingStat: no table ID set (SINGSTAT_POP_TABLE_ID or --singstat-table), skipping")
        return 0
    url = SINGSTAT_URL.format(table_id=table_id)
    resp = http.get(url, check_robots=False, headers={"Accept": "application/json"})
    if resp is None:
        return 0
    return loader.process(loader.store.save_response("singstat", url, resp))
