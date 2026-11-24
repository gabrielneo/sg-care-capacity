"""Ask the Internet Archive to keep its own dated copy of each MOH and NUHS file a run fetched.

The copy is evidence a third party holds: anyone can open it and compare it with fetch_log.json in
the published snapshot. It needs Save Page Now API keys (IA_ACCESS_KEY, IA_SECRET_KEY; free with an
archive.org account), because anonymous saves are refused with HTTP 429. A save that fails is
recorded with archive_url null and never blocks a run.

The Archive fetches the URL itself, a few seconds after we did: a workbook is the same file, but the
NUHS page changes continuously, so its copy can show slightly different figures.
"""
from __future__ import annotations

import json
import logging
import time
from collections.abc import Callable, Iterable
from datetime import datetime
from pathlib import Path

import requests

from .. import config
from ..raw import RawRecord

LOG = logging.getLogger(__name__)

ARCHIVE_SOURCES = frozenset({"moh_page", "moh_bed_waits", "moh_ed_attendances", "nuhs_live"})
CAPTURES_NAME = "wayback_captures.jsonl"
SAVE_API = "https://web.archive.org/save"
POLLS = 12                 # status checks per save; a save usually finishes within a minute
POLL_SECONDS = 10.0


def urls_to_archive(records: Iterable[RawRecord], since: datetime) -> list[str]:
    """MOH and NUHS URLs fetched at or after `since`, once each. Archive copies are evidence already."""
    return sorted({r.url for r in records
                   if r.source in ARCHIVE_SOURCES and r.fetched_at >= since
                   and not r.url.startswith("https://web.archive.org/")})


def _save(session: requests.Session, auth: str, url: str, sleep: Callable[[float], None]) -> str | None:
    headers = {"Accept": "application/json", "Authorization": auth}
    try:
        job = session.post(SAVE_API, data={"url": url}, headers=headers, timeout=60).json()
        job_id = job["job_id"]
        for _ in range(POLLS):
            sleep(POLL_SECONDS)
            status = session.get(f"{SAVE_API}/status/{job_id}", headers=headers, timeout=60).json()
            if status.get("status") == "success":
                return f"https://web.archive.org/web/{status['timestamp']}/{url}"
            if status.get("status") != "pending":
                LOG.warning("Wayback save %s: %s", url, status.get("message") or status.get("status"))
                return None
        LOG.warning("Wayback save %s: still pending after %d checks", url, POLLS)
    except (requests.RequestException, ValueError, KeyError) as exc:
        LOG.warning("Wayback save %s failed: %s", url, exc)
    return None


def archive_run(session: requests.Session, raw_root: Path, records: Iterable[RawRecord], since: datetime, *,
                access_key: str, secret_key: str, sleep: Callable[[float], None] = time.sleep) -> list[dict]:
    """Save each URL, append one line per URL to data/raw/wayback_captures.jsonl, and return the lines."""
    auth = f"LOW {access_key}:{secret_key}"
    captures = []
    for url in urls_to_archive(records, since):
        requested_at = config.now_sgt().isoformat(timespec="seconds")
        captures.append({"url": url, "requested_at": requested_at, "archive_url": _save(session, auth, url, sleep)})
        sleep(config.ARCHIVE_DELAY[0])
    if captures:
        with (Path(raw_root) / CAPTURES_NAME).open("a", encoding="utf-8") as fh:
            fh.writelines(json.dumps(c, sort_keys=True) + "\n" for c in captures)
    saved = sum(c["archive_url"] is not None for c in captures)
    LOG.info("Wayback: %d of %d URLs saved", saved, len(captures),
             extra={"fields": {"event": "wayback_summary", "saved": saved, "requested": len(captures)}})
    return captures


def read_captures(raw_root: Path) -> list[dict]:
    path = Path(raw_root) / CAPTURES_NAME
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
