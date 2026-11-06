"""data.gov.sg open datasets: CHAS clinics and clinics on the Health Appointment System."""
from __future__ import annotations

import logging
import time
from typing import Optional

from ..config import DATAGOV_API_KEY, DATAGOV_BASE, DATAGOV_DATASETS, now_sgt
from ..http import PoliteHttp
from ..parsers.datagov import normalize_clinics, parse_datagov_payload
from ..warehouse import Warehouse

LOG = logging.getLogger(__name__)


def fetch_datagov_dataset(http: PoliteHttp, dataset_id: str) -> Optional[bytes]:
    """Download a data.gov.sg dataset using the initiate/poll-download flow."""
    headers = {"x-api-key": DATAGOV_API_KEY} if DATAGOV_API_KEY else None
    poll = f"{DATAGOV_BASE}/{dataset_id}/poll-download"
    for attempt in range(5):
        payload = http.get_json(poll, headers=headers, check_robots=False)
        url = (payload or {}).get("data", {}).get("url") if isinstance(payload, dict) else None
        if url:
            return http.get_bytes(url, check_robots=False)
        if attempt == 0:  # ask the API to prepare the file, then poll again
            http.get_json(f"{DATAGOV_BASE}/{dataset_id}/initiate-download",
                          headers=headers, check_robots=False)
        time.sleep(3)
    LOG.warning("data.gov.sg dataset %s: no download URL after polling", dataset_id)
    return None


def ingest_opendata(http: PoliteHttp, wh: Warehouse) -> int:
    total = 0
    for key, table in (("chas", "chas_clinics"), ("has", "has_clinics")):
        content = fetch_datagov_dataset(http, DATAGOV_DATASETS[key])
        if not content:
            continue
        raw = parse_datagov_payload(content)
        df = normalize_clinics(raw)
        if df.empty:
            LOG.warning("data.gov.sg %s: no clinics parsed (columns: %s)", key, list(raw.columns)[:15])
            continue
        df["is_active"] = True
        df["ingested_at"] = now_sgt()
        wh.mark_inactive(table)
        n = wh.upsert(table, df, ["clinic_key"])
        LOG.info("data.gov.sg %s: %d clinics", key, n)
        total += n
    return total
