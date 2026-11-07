"""The snapshot is verified against its manifest before anything is served; failures refuse to start."""
import json
import shutil
from pathlib import Path

import duckdb
import httpx
import pytest
from fixture_snapshot import SNAPSHOT_ID

from sg_health_api.config import Settings
from sg_health_api.snapshot import SnapshotError, load_snapshot


def load_local(path: Path):
    return load_snapshot(Settings(local_snapshot_path=path))


# ------------------------------------------------------------------- local #

def test_local_snapshot_verifies_and_opens_read_only(snapshot_dir):
    snap = load_local(snapshot_dir)
    try:
        assert (snap.snapshot_id, snap.release_tag) == (SNAPSHOT_ID, None)
        assert snap.query("SELECT count(*) AS n FROM marts.dim_hospital WHERE cluster = ?", ["NUHS"]) == [{"n": 2}]
        with pytest.raises(duckdb.Error):
            snap.con.execute("DELETE FROM marts.dim_hospital")             # read_only=True
    finally:
        snap.close()


def test_release_layout_with_parquet_flattened_is_accepted(fresh_snapshot):
    for f in (fresh_snapshot / "parquet").glob("*.parquet"):
        f.rename(fresh_snapshot / f.name)
    (fresh_snapshot / "parquet").rmdir()
    load_local(fresh_snapshot).close()


@pytest.mark.parametrize("break_it, message", [
    (lambda d: (d / "planning_area_access.geojson").write_text("{}"), "planning_area_access.geojson"),
    (lambda d: (d / "parquet" / "dim_clinic.parquet").unlink(), "parquet/dim_clinic.parquet: missing"),
    (lambda d: flip_a_byte(d / "parquet" / "fct_ed_daily.parquet"), "sha256 does not match"),
    (lambda d: flip_a_byte(d / "analytics.duckdb", at=-100), "analytics.duckdb: sha256 does not match"),
])
def test_any_file_that_doesnt_match_the_manifest_refuses_to_start(fresh_snapshot, break_it, message):
    break_it(fresh_snapshot)
    with pytest.raises(SnapshotError, match="failed verification") as err:
        load_local(fresh_snapshot)
    assert message in str(err.value)


def flip_a_byte(path: Path, at: int = 200) -> None:
    data = bytearray(path.read_bytes())
    data[at] ^= 0xFF
    path.write_bytes(bytes(data))                                          # same size, different hash


def edit_manifest(d: Path, change) -> None:
    m = json.loads((d / "manifest.json").read_text())
    change(m)
    (d / "manifest.json").write_text(json.dumps(m))


def test_row_counts_that_dont_match_the_manifest_refuse_to_start(fresh_snapshot):
    edit_manifest(fresh_snapshot, lambda m: m["row_counts"].update(fct_ed_daily=95))
    with pytest.raises(SnapshotError, match="marts.fct_ed_daily: 96 rows, manifest says 95"):
        load_local(fresh_snapshot)


@pytest.mark.parametrize("change, message", [
    (lambda m: m.pop("sources"), "lacks \\['sources'\\]"),
    (lambda m: m["artefacts"].pop("analytics.duckdb"), "analytics.duckdb is not listed"),
    (lambda m: m["row_counts"].update({"x; DROP TABLE y": 1}), "listed in the manifest but not in the database"),
])
def test_an_incomplete_or_odd_manifest_refuses_to_start(fresh_snapshot, change, message):
    edit_manifest(fresh_snapshot, change)
    with pytest.raises(SnapshotError, match=message):
        load_local(fresh_snapshot)


def test_missing_local_folder_refuses_to_start(tmp_path):
    with pytest.raises(SnapshotError, match="is not a folder"):
        load_local(tmp_path / "nope")


# ------------------------------------------------------------------ GitHub #

class FakeGitHub:
    """Serves a release listing and asset downloads from a snapshot folder; records every request."""

    def __init__(self, snapshot: Path, releases: list[tuple[str, bool]], corrupt: str | None = None):
        self.snapshot, self.corrupt, self.calls = snapshot, corrupt, []
        files = {p.name: p for p in snapshot.rglob("*") if p.is_file()}
        self.files = files
        self.releases = [{"tag_name": tag, "prerelease": pre, "draft": False,
                          "assets": [{"name": n, "browser_download_url": f"https://dl.example/{tag}/{n}"} for n in files]}
                         for tag, pre in releases]

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.calls.append(request)
        url = str(request.url)
        if url.startswith("https://api.github.com/repos/gabrielneo/sg-care-capacity/releases/tags/"):
            tag = url.rsplit("/", 1)[1]
            rel = next((r for r in self.releases if r["tag_name"] == tag), None)
            return httpx.Response(200, json=rel) if rel else httpx.Response(404, json={"message": "Not Found"})
        if url.startswith("https://api.github.com/repos/gabrielneo/sg-care-capacity/releases"):
            return httpx.Response(200, json=self.releases)
        if url.startswith("https://dl.example/"):
            name = url.rsplit("/", 1)[1]
            body = self.files[name].read_bytes()
            if name == self.corrupt:
                body = body[:-1] + bytes([body[-1] ^ 1])
            return httpx.Response(200, content=body)
        return httpx.Response(500)

    def downloads(self) -> list[str]:
        return [str(c.url).rsplit("/", 1)[1] for c in self.calls if c.url.host == "dl.example"]


RELEASES = [("data-latest", False), ("live-latest", False), ("data-2026-10-25", False),
            ("data-2026-11-01", False), ("data-2026-11-08", True)]          # 11-08 withdrawn (pre-release)


def load_from(fake: FakeGitHub, tmp_path: Path, **settings):
    s = Settings(cache_dir=tmp_path / "cache", **settings)
    with httpx.Client(transport=httpx.MockTransport(fake)) as client:
        return load_snapshot(s, client)


def test_latest_is_the_newest_dated_snapshot_that_isnt_withdrawn(snapshot_dir, tmp_path):
    fake = FakeGitHub(snapshot_dir, RELEASES)
    snap = load_from(fake, tmp_path)
    try:
        assert snap.release_tag == "data-2026-11-01"                       # not 11-08, data-latest or live-latest
        assert snap.path == tmp_path / "cache" / "data-2026-11-01"
        assert snap.snapshot_id == SNAPSHOT_ID
    finally:
        snap.close()


def test_verified_files_are_not_downloaded_again(snapshot_dir, tmp_path):
    fake = FakeGitHub(snapshot_dir, RELEASES)
    load_from(fake, tmp_path).close()
    first = fake.downloads()
    load_from(fake, tmp_path).close()
    assert len(first) == len(fake.files) and fake.downloads()[len(first):] == ["manifest.json"]


def test_a_pinned_tag_is_served_even_if_newer_ones_exist(snapshot_dir, tmp_path):
    snap = load_from(FakeGitHub(snapshot_dir, RELEASES), tmp_path, data_snapshot="data-2026-10-25")
    assert snap.release_tag == "data-2026-10-25"
    snap.close()


def test_a_pinned_tag_that_doesnt_exist_refuses_to_start(snapshot_dir, tmp_path):
    with pytest.raises(SnapshotError, match="release data-2020-01-01 not found"):
        load_from(FakeGitHub(snapshot_dir, RELEASES), tmp_path, data_snapshot="data-2020-01-01")


def test_a_corrupted_download_refuses_to_start(snapshot_dir, tmp_path):
    with pytest.raises(SnapshotError, match="analytics.duckdb: sha256 does not match"):
        load_from(FakeGitHub(snapshot_dir, RELEASES, corrupt="analytics.duckdb"), tmp_path)


def test_no_dated_snapshot_release_refuses_to_start(snapshot_dir, tmp_path):
    with pytest.raises(SnapshotError, match="no published data-YYYY-MM-DD release"):
        load_from(FakeGitHub(snapshot_dir, [("data-latest", False), ("data-2026-11-08", True)]), tmp_path)


def test_the_token_goes_to_the_github_api_only(snapshot_dir, tmp_path):
    fake = FakeGitHub(snapshot_dir, RELEASES)
    load_from(fake, tmp_path, github_token="secret").close()
    for call in fake.calls:
        assert ("authorization" in call.headers) == (call.url.host == "api.github.com"), call.url


def test_cache_with_a_stale_file_is_repaired(snapshot_dir, tmp_path):
    fake = FakeGitHub(snapshot_dir, RELEASES)
    load_from(fake, tmp_path).close()
    shutil.copy(snapshot_dir / "manifest.json", tmp_path / "cache" / "data-2026-11-01" / "dim_hospital.parquet")
    load_from(fake, tmp_path).close()
    assert fake.downloads()[-1] == "dim_hospital.parquet"
