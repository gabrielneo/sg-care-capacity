"""Immutable raw landing zone.

Every downloaded file or HTML snapshot is written unchanged to

    data/raw/<source>/<YYYY-MM-DD>/<sha256>.<ext>

before anything parses it. Files are written once (temp file + atomic rename),
made read-only, and never overwritten. If the same bytes were already stored
for that source, the existing file is reused.

Every fetch, including one that returned bytes we already had, appends a line
to ``data/raw/manifest.jsonl``. That log is the replay order for ``reparse`` and
makes ``data/raw`` self-describing: the warehouse can be rebuilt from it alone.
"""
from __future__ import annotations

import json
import os
import stat
import tempfile
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterator, Optional
from urllib.parse import urlparse

from .config import now_sgt
from .parsers.common import sha256

MANIFEST_NAME = "manifest.jsonl"

_KNOWN_EXT = {"xlsx", "xls", "html", "htm", "json", "geojson", "csv", "txt"}
_CONTENT_TYPE_EXT = [            # checked in order; first substring match wins
    ("spreadsheetml", "xlsx"), ("ms-excel", "xls"), ("geo+json", "geojson"),
    ("json", "json"), ("html", "html"), ("csv", "csv"), ("text/plain", "txt"),
]


@dataclass(frozen=True)
class RawRecord:
    """One fetch, as written to manifest.jsonl and the raw_manifest table."""
    seq: int                      # position in manifest.jsonl (0-based): the replay order
    source: str                   # which loader parses it, e.g. "moh_bed_waits"
    url: str                      # the URL the bytes came from (an archive URL for Wayback copies)
    sha256: str
    bytes: int
    http_status: Optional[int]    # None for a Playwright-rendered page (no HTTP response of its own)
    content_type: Optional[str]
    fetched_at: datetime          # SGT, naive
    path: str                     # relative to the raw root

    def to_json(self) -> str:
        d = asdict(self)
        d["fetched_at"] = self.fetched_at.isoformat()
        return json.dumps(d, sort_keys=True)

    @classmethod
    def from_json(cls, line: str) -> "RawRecord":
        d = json.loads(line)
        d["fetched_at"] = datetime.fromisoformat(d["fetched_at"])
        return cls(**d)


def guess_ext(url: str, content_type: Optional[str]) -> str:
    """Extension for the stored file: the URL's if it's a known data type, else from Content-Type."""
    suffix = Path(urlparse(url).path).suffix.lower().lstrip(".")
    if suffix in _KNOWN_EXT:
        return "html" if suffix == "htm" else suffix
    ct = (content_type or "").lower()
    for needle, ext in _CONTENT_TYPE_EXT:
        if needle in ct:
            return ext
    return "bin"


class RawStore:
    """Read and append to the landing zone rooted at ``root`` (normally data/raw)."""

    def __init__(self, root: str | Path) -> None:
        self.root = Path(root)
        self.manifest = self.root / MANIFEST_NAME
        self._count: Optional[int] = None   # manifest lines so far, read once then tracked

    # -- writing ------------------------------------------------------------ #
    def save(self, source: str, url: str, content: bytes, *, http_status: Optional[int],
             content_type: Optional[str], fetched_at: Optional[datetime] = None) -> RawRecord:
        """Store ``content`` (if new) and append a manifest line. Returns that line's record."""
        fetched_at = fetched_at or now_sgt()
        digest = sha256(content)
        existing = self._find(source, digest)
        if existing is None:
            day_dir = self.root / source / fetched_at.date().isoformat()
            target = day_dir / f"{digest}.{guess_ext(url, content_type)}"
            self._write_once(target, content)
        else:
            target = existing
        rec = RawRecord(seq=self._next_seq(), source=source, url=url, sha256=digest,
                        bytes=len(content), http_status=http_status, content_type=content_type,
                        fetched_at=fetched_at, path=target.relative_to(self.root).as_posix())
        self.root.mkdir(parents=True, exist_ok=True)
        with self.manifest.open("a", encoding="utf-8") as fh:
            fh.write(rec.to_json() + "\n")
            fh.flush()
            os.fsync(fh.fileno())
        return rec

    def save_response(self, source: str, url: str, resp) -> RawRecord:
        """Convenience wrapper for a requests.Response."""
        return self.save(source, url, resp.content, http_status=resp.status_code,
                         content_type=resp.headers.get("Content-Type"))

    @staticmethod
    def _write_once(target: Path, content: bytes) -> None:
        target.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=target.parent, prefix=".tmp-")
        try:
            with os.fdopen(fd, "wb") as fh:
                fh.write(content)
                fh.flush()
                os.fsync(fh.fileno())
            os.chmod(tmp, stat.S_IRUSR | stat.S_IRGRP | stat.S_IROTH)   # 0444: read-only
            os.replace(tmp, target)
        except BaseException:
            if os.path.exists(tmp):
                os.unlink(tmp)
            raise

    def _find(self, source: str, digest: str) -> Optional[Path]:
        hits = sorted((self.root / source).glob(f"*/{digest}.*"))
        return hits[0] if hits else None

    def _next_seq(self) -> int:
        if self._count is None:
            self._count = 0
            if self.manifest.exists():
                with self.manifest.open("rb") as fh:
                    self._count = sum(1 for line in fh if line.strip())
        seq, self._count = self._count, self._count + 1
        return seq

    # -- reading ------------------------------------------------------------ #
    def records(self) -> list[RawRecord]:
        """Every manifest line, in the order the fetches happened."""
        return list(self.iter_records())

    def iter_records(self) -> Iterator[RawRecord]:
        if not self.manifest.exists():
            return
        with self.manifest.open(encoding="utf-8") as fh:
            for line in fh:
                if line.strip():
                    yield RawRecord.from_json(line)

    def read(self, rec: RawRecord) -> bytes:
        data = (self.root / rec.path).read_bytes()
        if sha256(data) != rec.sha256:   # the landing zone must never change under us
            raise ValueError(f"raw file {rec.path} does not match its sha256 {rec.sha256}")
        return data
