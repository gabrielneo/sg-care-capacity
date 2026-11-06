"""SingStat Table Builder: residents by planning area and age group."""
from __future__ import annotations

import logging
from typing import Optional

from ..config import SINGSTAT_URL, now_sgt
from ..http import PoliteHttp
from ..parsers.singstat import derive_pop65, parse_singstat_tabledata, title_year
from ..warehouse import Warehouse

LOG = logging.getLogger(__name__)


def ingest_singstat(http: PoliteHttp, wh: Warehouse, table_id: Optional[str]) -> int:
    if not table_id:
        LOG.info("SingStat: no table ID set (SINGSTAT_POP_TABLE_ID or --singstat-table), skipping")
        return 0
    payload = http.get_json(SINGSTAT_URL.format(table_id=table_id), check_robots=False,
                            headers={"Accept": "application/json"})
    if not isinstance(payload, dict):
        return 0
    flat = parse_singstat_tabledata(payload, table_id)
    flat["ingested_at"] = now_sgt()
    n = wh.upsert("singstat_tabledata", flat, ["table_id", "row_label", "column_path"])
    pop = derive_pop65(flat, title_year(payload))
    if not pop.empty:
        pop["source_table"] = table_id
        pop["ingested_at"] = now_sgt()
        pop = pop.dropna(subset=["year"])
        wh.upsert("pop_65plus_by_area", pop, ["planning_area", "year"])
    LOG.info("SingStat %s: %d cells, %d planning-area rows", table_id, n, len(pop))
    return n
