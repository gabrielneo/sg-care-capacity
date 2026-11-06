"""Live wait-time pages: polite snapshots of NUHS ED waits and SingHealth X-ray QWatch."""
from __future__ import annotations

import logging

import pandas as pd

from ..config import NUHS_LIVE_URL, SINGHEALTH_QWATCH_URL, now_sgt
from ..http import PoliteHttp, render_with_playwright
from ..parsers.live import parse_nuhs_live, parse_singhealth_qwatch
from ..warehouse import Warehouse

LOG = logging.getLogger(__name__)


def ingest_live(http: PoliteHttp, wh: Warehouse) -> int:
    total = 0
    snap = now_sgt().replace(second=0)

    html = http.get_text(NUHS_LIVE_URL)
    rows = parse_nuhs_live(html) if html else []
    if not rows:
        LOG.info("NUHS: no data in static HTML, trying the JS-rendered page")
        rendered = render_with_playwright(NUHS_LIVE_URL)
        rows = parse_nuhs_live(rendered) if rendered else []
    if rows:
        df = pd.DataFrame(rows)
        # Use the page's own "last updated" time as the snapshot key, so repeated
        # runs between page updates don't create duplicate rows.
        df["snapshot_timestamp"] = df["source_updated_at"].fillna(snap) \
            if "source_updated_at" in df else snap
        total += wh.upsert("nuhs_live_waits", df, ["site_name", "snapshot_timestamp"])
    else:
        LOG.warning("NUHS: could not parse any wait-time rows")

    html = http.get_text(SINGHEALTH_QWATCH_URL)
    rows = parse_singhealth_qwatch(html) if html else []
    if not rows:
        rendered = render_with_playwright(SINGHEALTH_QWATCH_URL)
        rows = parse_singhealth_qwatch(rendered) if rendered else []
    if rows:
        df = pd.DataFrame(rows)
        df["snapshot_timestamp"] = snap
        total += wh.upsert("singhealth_xray_waits", df, ["site_name", "snapshot_timestamp"])
    else:
        LOG.warning("SingHealth QWatch: could not parse any rows")
    return total
