"""SingStat: residents by planning area, age group, sex and type of dwelling (annual file).

Read from the committed reference copy only (data/reference/singstat/): it is downloaded by hand
once a year, because SingStat refuses GitHub's runners. The file is loaded only if its SHA-256
matches config.SINGSTAT_RESIDENTS_SHA256, so it is provably the file SingStat published. Lineage
records SingStat's URL as provenance; the manifest line has http_status NULL (not an HTTP response).
"""
from __future__ import annotations

import hashlib
import logging

from ..config import SINGSTAT_RESIDENTS_FILE, SINGSTAT_RESIDENTS_SHA256, SINGSTAT_RESIDENTS_URL
from ..http import PoliteHttp
from ..load import Loader

LOG = logging.getLogger(__name__)
SOURCE = "singstat_residents"


def ingest_singstat(http: PoliteHttp, loader: Loader) -> int:
    """`http` is unused on purpose: this source never touches the network."""
    path = SINGSTAT_RESIDENTS_FILE
    if not path.exists():
        LOG.error("SingStat reference file missing: %s (see docs/runbook.md)", path)
        return 0
    content = path.read_bytes()
    digest = hashlib.sha256(content).hexdigest()
    if digest != SINGSTAT_RESIDENTS_SHA256:
        LOG.error("SingStat reference file %s has sha256 %s, expected %s; not loading it "
                  "(update config.SINGSTAT_RESIDENTS_SHA256 only after checking the new file)",
                  path.name, digest[:12], SINGSTAT_RESIDENTS_SHA256[:12])
        return 0
    rec = loader.store.save(SOURCE, SINGSTAT_RESIDENTS_URL, content, http_status=None,
                            content_type="application/zip")
    return loader.process(rec)
