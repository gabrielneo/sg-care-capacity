"""Loaders: one per raw source. A loader turns one landed raw file into warehouse rows.

``run``/``backfill`` (fetch, land, then load) and ``reparse`` (replay data/raw) both
go through :class:`Loader`, so they cannot drift apart. Loaders read only the raw
bytes and the manifest record: every time value comes from ``rec.fetched_at``,
never from the clock, so replaying the same raw files always gives the same rows.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Callable, Iterable, Optional

import pandas as pd

from .config import ANNUAL_AE_SERIES, DATAGOV_DATASETS, MOH_SOURCES
from .logs import ParseStats
from .parsers.datagov import (normalize_clinics, parse_annual_ae, parse_datagov_metadata,
                              parse_datagov_payload, parse_planning_areas)
from .parsers.live import parse_nuhs_live
from .parsers.moh import parse_moh_workbook
from .parsers.singstat import parse_residents_zip
from .quality import rules  # noqa: F401  (registers the table rules with the gate)
from .quality.gate import GateContext, gate
from .raw import RawRecord, RawStore, link_url
from .warehouse import TABLE_KEYS, Warehouse

LOG = logging.getLogger(__name__)

LoaderFn = Callable[[Warehouse, RawRecord, bytes, ParseStats], int]

# Sources that publish files once (a new file per period). An identical file seen
# again is skipped. Snapshot sources (clinics, live pages, SingStat) are always
# reloaded, because each fetch restates the current state.
INCREMENTAL_SOURCES = frozenset(cfg["table"] for cfg in MOH_SOURCES.values())


def decode_text(rec: RawRecord, content: bytes) -> str:
    """Decode stored bytes using the charset from Content-Type, else UTF-8."""
    m = re.search(r"charset=([\w-]+)", rec.content_type or "", re.I)
    try:
        return content.decode(m.group(1) if m else "utf-8-sig", errors="replace")
    except LookupError:   # unknown charset name
        return content.decode("utf-8", errors="replace")


def lineage(rec: RawRecord) -> dict:
    """Columns every parsed row carries, pointing back to the raw file it came from.

    ingested_at is the raw file's fetched_at (when the data entered the pipeline), not the
    time the parser ran. That is what makes a reparse reproduce the same rows.
    """
    return {"source_url": link_url(rec.url), "source_sha256": rec.sha256, "ingested_at": rec.fetched_at}


def _with_lineage(df: pd.DataFrame, rec: RawRecord) -> pd.DataFrame:
    for col, value in lineage(rec).items():
        df[col] = value
    return df


def _upsert(wh: Warehouse, table: str, df: pd.DataFrame, keys: list[str], stats: ParseStats) -> int:
    """Upsert and account for it: rows written are parsed; key collisions are dropped."""
    n = wh.upsert(table, df, keys)
    stats.drop("duplicate_key", len(df) - n)
    stats.parsed += n
    return n


def _gated(wh: Warehouse, table: str, df: pd.DataFrame, rec: RawRecord, stats: ParseStats) -> pd.DataFrame:
    """Add lineage and run the data-quality gate. Returns only the rows that may be stored."""
    return gate(_with_lineage(df, rec), GateContext(wh, table, list(TABLE_KEYS[table]), rec, stats))


def _load(wh: Warehouse, table: str, df: pd.DataFrame, rec: RawRecord, stats: ParseStats) -> int:
    return _upsert(wh, table, _gated(wh, table, df, rec, stats), list(TABLE_KEYS[table]), stats)


# --------------------------------------------------------------------------- #
# One function per source
# --------------------------------------------------------------------------- #

def _moh_loader(metric: str) -> LoaderFn:
    table = MOH_SOURCES[metric]["table"]

    def load(wh: Warehouse, rec: RawRecord, content: bytes, stats: ParseStats) -> int:
        if content[:2] != b"PK":   # .xlsx files are zip archives; anything else is an error page
            LOG.warning("MOH %s: %s is not an .xlsx workbook, skipping", metric, rec.url)
            stats.files_skipped["not_a_workbook"] += 1
            return 0
        df = parse_moh_workbook(content, metric, source_file=rec.url.rsplit("/", 1)[-1], stats=stats)
        n = _load(wh, table, df, rec, stats)
        if n:
            LOG.debug("MOH %s: %d rows (%s to %s) from %s", metric, n,
                      df["report_date"].min(), df["report_date"].max(), rec.url)
        return n
    return load


def load_nuhs_live(wh: Warehouse, rec: RawRecord, content: bytes, stats: ParseStats) -> int:
    rows = parse_nuhs_live(decode_text(rec, content), stats=stats)
    if not rows:
        return 0
    df = pd.DataFrame(rows)
    # Use the page's own "last updated" time as the snapshot key, so repeated
    # fetches between page updates don't create duplicate rows.
    snap = rec.fetched_at.replace(second=0)
    df["snapshot_timestamp"] = df["source_updated_at"].fillna(snap) \
        if "source_updated_at" in df else snap
    return _load(wh, "nuhs_live_waits", df, rec, stats)


def _clinic_loader(label: str, table: str) -> LoaderFn:
    def load(wh: Warehouse, rec: RawRecord, content: bytes, stats: ParseStats) -> int:
        raw = parse_datagov_payload(content)
        df = normalize_clinics(raw, stats=stats)
        if df.empty:
            LOG.warning("data.gov.sg %s: no clinics parsed (columns: %s)", label, list(raw.columns)[:15])
            return 0
        df["is_active"] = True
        present = df["clinic_key"].dropna().astype(str).unique()
        clean = _gated(wh, table, df, rec, stats)
        # Full snapshot: clinics missing from it stay, flagged inactive. Quarantined clinics are
        # in the snapshot, so their last good row (if any) stays active.
        wh.mark_inactive(table, "clinic_key", present)
        return _upsert(wh, table, clean, ["clinic_key"], stats)
    return load


def load_singstat_residents(wh: Warehouse, rec: RawRecord, content: bytes, stats: ParseStats) -> int:
    df = parse_residents_zip(content, stats=stats)        # raises SingStatFormatError on any surprise
    return _load(wh, "pop_65plus_by_area", df, rec, stats)


def load_annual_ae(wh: Warehouse, rec: RawRecord, content: bytes, stats: ParseStats) -> int:
    df = parse_annual_ae(content, ANNUAL_AE_SERIES, stats=stats)
    if df.empty:
        LOG.warning("annual A&E: series %r not found in %s", ANNUAL_AE_SERIES, rec.url)
        stats.files_skipped["series_not_found"] += 1
        return 0
    return _load(wh, "annual_ae_attendances", df, rec, stats)


def load_datagov_metadata(wh: Warehouse, rec: RawRecord, content: bytes, stats: ParseStats) -> int:
    from .sources.datagov import DATASET_SOURCES       # dataset key -> raw source name
    source_by_id = {DATAGOV_DATASETS[key]: src for key, src in DATASET_SOURCES}
    try:
        payload = json.loads(decode_text(rec, content))
    except ValueError:
        stats.files_skipped["not_json"] += 1
        return 0
    df = parse_datagov_metadata(payload, source_by_id)
    stats.read(len(df))
    if df.empty:
        stats.files_skipped["no_dataset_id"] += 1
        return 0
    return _load(wh, "source_metadata", df, rec, stats)


def load_planning_areas(wh: Warehouse, rec: RawRecord, content: bytes, stats: ParseStats) -> int:
    df = parse_planning_areas(content, stats=stats)       # raises BoundaryFormatError on surprises
    clean = _gated(wh, "planning_area_boundaries", df, rec, stats)
    if clean.empty:
        return 0
    # A boundary file is a full snapshot: the latest one replaces the previous areas entirely, so
    # a renamed or merged area doesn't linger.
    wh.con.execute("DELETE FROM planning_area_boundaries")
    return _upsert(wh, "planning_area_boundaries", clean, ["planning_area_code"], stats)


LOADERS: dict[str, LoaderFn] = {
    "moh_bed_waits": _moh_loader("bed_waits"),
    "moh_ed_attendances": _moh_loader("ed_attendances"),
    "nuhs_live": load_nuhs_live,
    "datagov_chas": _clinic_loader("chas", "chas_clinics"),
    "datagov_annual_ae": load_annual_ae,
    "datagov_metadata": load_datagov_metadata,
    "datagov_planning_areas": load_planning_areas,
    "singstat_residents": load_singstat_residents,
}
# Landed for the record but not parsed into tables (e.g. the MOH pages that link to the files).
# Retired sources are no longer fetched, but their raw files stay in data/raw (it is
# immutable), so reparse must recognise and skip them:
#   singhealth_qwatch  X-ray QWatch page retired (redirects to the SingHealth homepage), 2026-11-06
#   datagov_has        Health Appointment System clinic list unpublished on data.gov.sg, 2026-11-06
#   singstat           SingStat Table Builder JSON, replaced by the singstat_residents file, 2026-11-06
RETIRED_SOURCES = frozenset({"singhealth_qwatch", "datagov_has", "singstat"})
UNPARSED_SOURCES = frozenset({"moh_page"}) | RETIRED_SOURCES


class Loader:
    """Applies raw records to the warehouse and keeps per-source row accounting."""

    def __init__(self, wh: Warehouse, store: RawStore, *, force: bool = False,
                 seen: Optional[Iterable[tuple[str, str]]] = None) -> None:
        self.wh = wh
        self.store = store
        self.force = force
        self.seen: set[tuple[str, str]] = set(seen or ())
        self.stats: dict[str, ParseStats] = {}

    @classmethod
    def for_run(cls, wh: Warehouse, store: RawStore, force: bool = False) -> "Loader":
        """A loader that knows every (source, sha256) already in the landing zone."""
        return cls(wh, store, force=force, seen=((r.source, r.sha256) for r in store.iter_records()))

    def stats_for(self, source: str) -> ParseStats:
        return self.stats.setdefault(source, ParseStats())

    def expect(self, *sources: str) -> None:
        """Make sure these sources get a summary line, even if nothing was fetched for them."""
        for s in sources:
            self.stats_for(s)

    def process(self, rec: RawRecord) -> int:
        """Load one raw record. Returns rows upserted (0 if skipped or unparsed)."""
        fn = LOADERS.get(rec.source)
        if fn is None:
            if rec.source not in UNPARSED_SOURCES:
                LOG.warning("No loader for raw source %r (%s)", rec.source, rec.path)
            return 0
        stats = self.stats_for(rec.source)
        stats.files += 1
        key = (rec.source, rec.sha256)
        if rec.source in INCREMENTAL_SOURCES and key in self.seen and not self.force:
            LOG.debug("%s: %s unchanged (same sha256), skipping", rec.source, rec.url)
            stats.files_skipped["unchanged"] += 1
            return 0
        self.seen.add(key)
        try:
            return fn(self.wh, rec, self.store.read(rec), stats)
        except Exception:
            stats.files_skipped["load_error"] += 1
            raise

    def log_summary(self, command: str) -> None:
        """One structured line per source: files, rows read, parsed, dropped and why."""
        for source in sorted(self.stats):
            st = self.stats[source]
            LOG.info("%s %s: read %d, parsed %d, dropped %d", command, source, st.rows_read,
                     st.parsed, st.dropped,
                     extra={"fields": {"event": "source_summary", "command": command,
                                       "source": source, **st.as_fields()}})


def reparse(wh: Warehouse, store: RawStore) -> tuple[dict[str, int], int]:
    """Rebuild every parsed table from data/raw alone. No network access.

    Drops the parsed tables, reloads raw_manifest from manifest.jsonl, then replays every
    record in fetch order through the same loaders `run` uses. Returns (rows upserted per
    source, number of raw records that failed to load).
    """
    wh.reset()
    records = store.records()
    wh.sync_manifest(records)
    loader = Loader(wh, store)            # nothing seen yet: the replay starts from empty
    loader.expect(*LOADERS)
    failed = 0
    for rec in records:
        try:
            loader.process(rec)
        except Exception:                 # one bad file must not stop the replay
            LOG.exception("reparse: could not load %s (%s)", rec.path, rec.source)
            failed += 1
    loader.log_summary("reparse")
    LOG.info("reparse: %d raw records replayed, %d failed", len(records), failed,
             extra={"fields": {"event": "reparse_done", "records": len(records), "failed": failed}})
    return {s: st.parsed for s, st in loader.stats.items()}, failed
