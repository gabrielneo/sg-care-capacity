"""data.gov.sg open datasets: CHAS clinics (GeoJSON) and the annual A&E series (CSV)."""
from __future__ import annotations

import logging
import time
from typing import Optional

import requests

from ..config import DATAGOV_API_KEY, DATAGOV_BASE, DATAGOV_DATASETS
from ..http import PoliteHttp
from ..load import Loader

LOG = logging.getLogger(__name__)

DATASET_SOURCES = (("chas", "datagov_chas"), ("annual_ae", "datagov_annual_ae"))


def fetch_datagov_dataset(http: PoliteHttp, dataset_id: str
                          ) -> Optional[tuple[str, requests.Response]]:
    """Download a data.gov.sg dataset using the initiate/poll-download flow.

    Returns (download_url, response), or None.
    """
    headers = {"x-api-key": DATAGOV_API_KEY} if DATAGOV_API_KEY else None
    poll = f"{DATAGOV_BASE}/{dataset_id}/poll-download"
    for attempt in range(5):
        payload = http.get_json(poll, headers=headers, check_robots=False)
        url = (payload or {}).get("data", {}).get("url") if isinstance(payload, dict) else None
        if url:
            resp = http.get(url, check_robots=False)
            return (url, resp) if resp is not None else None
        if attempt == 0:  # ask the API to prepare the file, then poll again
            http.get_json(f"{DATAGOV_BASE}/{dataset_id}/initiate-download",
                          headers=headers, check_robots=False)
        time.sleep(3)
    LOG.warning("data.gov.sg dataset %s: no download URL after polling", dataset_id)
    return None


def ingest_opendata(http: PoliteHttp, loader: Loader) -> int:
    total = 0
    for key, source in DATASET_SOURCES:
        got = fetch_datagov_dataset(http, DATAGOV_DATASETS[key])
        if not got:
            continue
        url, resp = got
        # save_response strips the signature from the signed download URL before recording it
        total += loader.process(loader.store.save_response(source, url, resp))
    return total
