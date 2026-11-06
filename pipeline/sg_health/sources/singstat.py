"""SingStat: residents by planning area, age group, sex and type of dwelling (annual file).

Live first, always. If SingStat refuses or can't be reached (it returns HTTP 403 to GitHub's
runners), fall back to the pinned copy in the repo, but only if its SHA-256 matches the hash in
config: then the bytes are provably the file SingStat published, and lineage records SingStat's
URL with that hash. The manifest line has http_status NULL, marking bytes that did not come from
an HTTP response.
"""
from __future__ import annotations

import hashlib
import logging

from ..config import SINGSTAT_RESIDENTS_SEED, SINGSTAT_RESIDENTS_SEED_SHA256, SINGSTAT_RESIDENTS_URL
from ..http import PoliteHttp
from ..load import Loader

LOG = logging.getLogger(__name__)
SOURCE = "singstat_residents"


def ingest_singstat(http: PoliteHttp, loader: Loader) -> int:
    resp = http.get(SINGSTAT_RESIDENTS_URL)          # robots.txt allows it (Crawl-delay 2; we wait >= 1.5-3 s)
    if resp is not None:
        return loader.process(loader.store.save_response(SOURCE, SINGSTAT_RESIDENTS_URL, resp))
    return _from_pinned_copy(loader)


def _from_pinned_copy(loader: Loader) -> int:
    seed = SINGSTAT_RESIDENTS_SEED
    if not seed.exists():
        LOG.error("SingStat download failed and there is no pinned copy at %s", seed)
        return 0
    content = seed.read_bytes()
    digest = hashlib.sha256(content).hexdigest()
    if digest != SINGSTAT_RESIDENTS_SEED_SHA256:
        LOG.error("SingStat download failed and the pinned copy's sha256 %s does not match the expected %s; "
                  "not loading it", digest[:12], SINGSTAT_RESIDENTS_SEED_SHA256[:12])
        return 0
    LOG.warning("SingStat download failed; loading the pinned copy %s (sha256 %s verified)",
                seed.name, digest[:12], extra={"fields": {"event": "pinned_copy_used", "source": SOURCE}})
    rec = loader.store.save(SOURCE, SINGSTAT_RESIDENTS_URL, content, http_status=None,
                            content_type="application/zip")
    return loader.process(rec)
