"""Get one published snapshot, verify it against its manifest, and open it read-only.

A snapshot is the set of files `sg-health publish` writes (analytics.duckdb, one Parquet per
mart, the map GeoJSON) plus manifest.json, which records each file's SHA-256 and size and each
mart's row count. Releases upload `parquet/x.parquet` as `x.parquet`; both layouts are accepted.

Anything that doesn't verify raises SnapshotError and the API refuses to start. The manifest
travels with the files, so this proves the files are complete and uncorrupted, not that the
release itself is genuine.
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import duckdb
import httpx

from .config import TAG_RE, Settings

LOG = logging.getLogger(__name__)

SNAPSHOT_TAG_RE = re.compile(r"^data-\d{4}-\d{2}-\d{2}$")
IDENTIFIER_RE = re.compile(r"^[a-z_][a-z0-9_]*$")
GITHUB_API = "https://api.github.com"
MANIFEST = "manifest.json"
DATABASE = "analytics.duckdb"
GEOJSON = "planning_area_access.geojson"
SVY21_GEOJSON = "planning_area_access_svy21.geojson"     # optional: releases before 2026-11 lack it
MANIFEST_KEYS = ("snapshot_id", "created_at", "artefacts", "row_counts", "sources", "checks", "coverage_per_hospital")
# What the API reads. A snapshot without one of these can't be served.
REQUIRED_MARTS = ("dim_hospital", "fct_ed_daily", "fct_ed_weekly", "dim_clinic", "fct_live_ed_snapshot",
                  "fct_area_access", "dim_metric")
TIMEOUT = httpx.Timeout(60.0, connect=15.0)


class SnapshotError(RuntimeError):
    """The snapshot can't be found, downloaded or verified; the API must not start."""


@dataclass
class Snapshot:
    path: Path
    manifest: dict[str, Any]
    con: duckdb.DuckDBPyConnection
    release_tag: str | None          # None for LOCAL_SNAPSHOT_PATH
    repo: str | None = None          # owner/name the release came from; None for LOCAL_SNAPSHOT_PATH

    @property
    def snapshot_id(self) -> str:
        return str(self.manifest["snapshot_id"])

    @property
    def release_url(self) -> str | None:
        """The GitHub release page this snapshot was downloaded from, or None for a local snapshot."""
        if self.release_tag is None or self.repo is None:
            return None
        return f"https://github.com/{self.repo}/releases/tag/{self.release_tag}"

    def query(self, sql: str, params: list[Any] | tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        """Run one parameterised query on its own cursor (safe across request threads)."""
        cur = self.con.cursor()
        try:
            cur.execute(sql, list(params))
            cols = [d[0] for d in cur.description or []]
            return [dict(zip(cols, row, strict=True)) for row in cur.fetchall()]
        finally:
            cur.close()

    def file(self, rel: str) -> Path:
        found = locate(self.path, rel)
        if found is None:
            raise SnapshotError(f"{rel} is not in the snapshot")
        return found

    def close(self) -> None:
        self.con.close()


# --------------------------------------------------------------------------- #
# Verification
# --------------------------------------------------------------------------- #

def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def locate(base: Path, rel: str) -> Path | None:
    """The file at its manifest path, or flattened to its basename (as in a release)."""
    for candidate in (base / rel, base / Path(rel).name):
        if candidate.is_file():
            return candidate
    return None


def read_manifest(path: Path) -> dict[str, Any]:
    try:
        manifest = json.loads(path.read_text())
    except FileNotFoundError as exc:
        raise SnapshotError(f"no {MANIFEST} in {path.parent}") from exc
    except ValueError as exc:
        raise SnapshotError(f"{path} is not valid JSON: {exc}") from exc
    missing = [k for k in MANIFEST_KEYS if k not in manifest]
    if missing:
        raise SnapshotError(f"{path} lacks {missing}")
    return manifest


def verify_files(base: Path, manifest: dict[str, Any]) -> None:
    """Every file in the manifest is present with the recorded size and SHA-256."""
    artefacts: dict[str, dict[str, Any]] = manifest["artefacts"]
    problems = [f"{name} is not listed in the manifest" for name in (DATABASE, GEOJSON) if name not in artefacts]
    for rel, meta in sorted(artefacts.items()):
        path = locate(base, rel)
        if path is None:
            problems.append(f"{rel}: missing")
        elif path.stat().st_size != meta.get("bytes"):
            problems.append(f"{rel}: {path.stat().st_size} bytes, manifest says {meta.get('bytes')}")
        elif sha256_of(path) != meta.get("sha256"):
            problems.append(f"{rel}: sha256 does not match the manifest")
    if problems:
        raise SnapshotError("snapshot failed verification: " + "; ".join(problems))


def open_database(base: Path, manifest: dict[str, Any]) -> duckdb.DuckDBPyConnection:
    """Open analytics.duckdb read-only and check its tables against the manifest's row counts."""
    path = locate(base, DATABASE)
    assert path is not None                                   # verify_files ran first
    try:
        con = duckdb.connect(str(path), read_only=True)
    except duckdb.Error as exc:
        raise SnapshotError(f"cannot open {DATABASE} read-only: {exc}") from exc
    try:
        tables = {(s, t) for s, t in con.execute(
            "SELECT table_schema, table_name FROM information_schema.tables").fetchall()}
        problems = [f"marts.{m} missing" for m in REQUIRED_MARTS if ("marts", m) not in tables]
        if ("main", "dq_results") not in tables:
            problems.append("dq_results missing")
        for mart, expected in sorted(manifest["row_counts"].items()):
            if not IDENTIFIER_RE.match(mart) or ("marts", mart) not in tables:
                problems.append(f"marts.{mart} listed in the manifest but not in the database")
                continue
            # The only SQL built from a string: the name is a plain identifier that exists in the
            # catalogue (checked above). Request parameters never reach this code.
            actual = con.execute(f'SELECT count(*) FROM marts."{mart}"').fetchall()[0][0]
            if actual != expected:
                problems.append(f"marts.{mart}: {actual} rows, manifest says {expected}")
        if problems:
            raise SnapshotError("snapshot database does not match its manifest: " + "; ".join(problems))
    except BaseException:
        con.close()
        raise
    return con


# --------------------------------------------------------------------------- #
# GitHub releases
# --------------------------------------------------------------------------- #

def _api_headers(settings: Settings) -> dict[str, str]:
    headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    if settings.github_token:
        headers["Authorization"] = f"Bearer {settings.github_token}"
    return headers


def resolve_release(settings: Settings, client: httpx.Client) -> dict[str, Any]:
    """The release to serve: the pinned tag, or the newest non-pre-release data-YYYY-MM-DD."""
    base = f"{GITHUB_API}/repos/{settings.snapshot_repo}/releases"
    try:
        if settings.data_snapshot != "latest":
            r = client.get(f"{base}/tags/{settings.data_snapshot}", headers=_api_headers(settings))
            if r.status_code == 404:
                raise SnapshotError(f"release {settings.data_snapshot} not found in {settings.snapshot_repo}")
            r.raise_for_status()
            release: dict[str, Any] = r.json()
            if release.get("prerelease"):
                LOG.warning("serving %s, which is marked pre-release (withdrawn?)", settings.data_snapshot)
            return release
        r = client.get(base, params={"per_page": 100}, headers=_api_headers(settings))
        r.raise_for_status()
    except httpx.HTTPError as exc:
        raise SnapshotError(f"cannot list releases of {settings.snapshot_repo}: {exc}") from exc
    candidates = [rel for rel in r.json() if SNAPSHOT_TAG_RE.match(rel.get("tag_name", ""))
                  and not rel.get("prerelease") and not rel.get("draft")]
    if not candidates:
        raise SnapshotError(f"no published data-YYYY-MM-DD release in {settings.snapshot_repo}")
    return max(candidates, key=lambda rel: rel["tag_name"])


def _download(client: httpx.Client, url: str, dest: Path) -> None:
    tmp = dest.with_name(dest.name + ".part")
    try:
        with client.stream("GET", url, follow_redirects=True) as r:
            r.raise_for_status()
            with tmp.open("wb") as f:
                for chunk in r.iter_bytes():
                    f.write(chunk)
    except httpx.HTTPError as exc:
        tmp.unlink(missing_ok=True)
        raise SnapshotError(f"download failed for {url}: {exc}") from exc
    tmp.replace(dest)


def fetch_release(settings: Settings, client: httpx.Client) -> tuple[Path, str]:
    """Download a release into the cache. Files already there with the right hash are kept."""
    release = resolve_release(settings, client)
    tag = str(release["tag_name"])
    if not TAG_RE.match(tag):                                 # it becomes a folder name
        raise SnapshotError(f"unexpected release tag {tag!r}")
    assets = {a["name"]: a["browser_download_url"] for a in release.get("assets", [])}
    if MANIFEST not in assets:
        raise SnapshotError(f"release {tag} has no {MANIFEST}")
    dest = settings.cache_dir / tag
    dest.mkdir(parents=True, exist_ok=True)
    _download(client, assets[MANIFEST], dest / MANIFEST)          # small; always refreshed
    manifest = read_manifest(dest / MANIFEST)
    for rel, meta in manifest["artefacts"].items():
        name = Path(rel).name
        target = dest / name
        if target.is_file() and sha256_of(target) == meta.get("sha256"):
            continue
        if name not in assets:
            raise SnapshotError(f"release {tag} lacks {name}, which its manifest lists")
        LOG.info("downloading %s from %s", name, tag)
        _download(client, assets[name], target)
    return dest, tag


def load_snapshot(settings: Settings, client: httpx.Client | None = None) -> Snapshot:
    """Find, verify and open the snapshot named by the settings. Raises SnapshotError."""
    if settings.local_snapshot_path is not None:
        base, tag = settings.local_snapshot_path, None
        if not base.is_dir():
            raise SnapshotError(f"LOCAL_SNAPSHOT_PATH {base} is not a folder")
    else:
        own = client is None
        client = client or httpx.Client(timeout=TIMEOUT)
        try:
            base, tag_str = fetch_release(settings, client)
            tag = tag_str
        finally:
            if own:
                client.close()
    manifest = read_manifest(base / MANIFEST)
    verify_files(base, manifest)
    con = open_database(base, manifest)
    LOG.info("serving snapshot %s from %s", manifest["snapshot_id"], base)
    return Snapshot(path=base, manifest=manifest, con=con, release_tag=tag,
                    repo=settings.snapshot_repo if tag is not None else None)
