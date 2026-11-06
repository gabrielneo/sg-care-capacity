"""Raw landing zone: path layout, immutability, dedup by sha256 and the manifest."""
import hashlib
import json
import os
import stat
from datetime import datetime

import pytest

from sg_health.raw import RawRecord, RawStore, guess_ext

WHEN = datetime(2026, 11, 1, 8, 0, 5)


def test_save_writes_source_date_sha_path(tmp_path):
    store = RawStore(tmp_path)
    rec = store.save("moh_bed_waits", "https://x/a.xlsx", b"PK-data", http_status=200,
                     content_type="application/octet-stream", fetched_at=WHEN)
    digest = hashlib.sha256(b"PK-data").hexdigest()
    assert rec.path == f"moh_bed_waits/2026-11-01/{digest}.xlsx"
    assert (tmp_path / rec.path).read_bytes() == b"PK-data"
    assert rec.sha256 == digest and rec.bytes == 7 and rec.http_status == 200 and rec.seq == 0


def test_raw_files_are_read_only(tmp_path):
    rec = RawStore(tmp_path).save("nuhs_live", "https://x/p", b"<html/>", http_status=200,
                                  content_type="text/html", fetched_at=WHEN)
    mode = os.stat(tmp_path / rec.path).st_mode
    assert not mode & (stat.S_IWUSR | stat.S_IWGRP | stat.S_IWOTH)


def test_same_bytes_reuse_the_file_but_log_every_fetch(tmp_path):
    store = RawStore(tmp_path)
    first = store.save("moh_bed_waits", "https://x/a.xlsx", b"same", http_status=200,
                       content_type=None, fetched_at=WHEN)
    later = store.save("moh_bed_waits", "https://x/a.xlsx", b"same", http_status=200,
                       content_type=None, fetched_at=datetime(2026, 11, 8, 8, 0))
    assert later.path == first.path                          # stored once, under the first date
    assert [r.seq for r in store.records()] == [0, 1]        # but both fetches are in the manifest
    assert len(list(tmp_path.glob("moh_bed_waits/*/*"))) == 1


def test_manifest_round_trips_and_survives_a_new_store(tmp_path):
    RawStore(tmp_path).save("singstat", "https://x/t", b"{}", http_status=200,
                            content_type="application/json", fetched_at=WHEN)
    store = RawStore(tmp_path)                               # fresh instance reads the file
    rec = store.save("singstat", "https://x/t", b"{ }", http_status=200,
                     content_type="application/json", fetched_at=WHEN)
    assert rec.seq == 1
    lines = (tmp_path / "manifest.jsonl").read_text().splitlines()
    assert RawRecord.from_json(lines[0]).fetched_at == WHEN
    assert set(json.loads(lines[0])) == {"seq", "source", "url", "sha256", "bytes", "http_status",
                                         "content_type", "fetched_at", "path"}


def test_read_detects_a_tampered_file(tmp_path):
    store = RawStore(tmp_path)
    rec = store.save("singstat", "https://x/t", b"{}", http_status=200, content_type=None, fetched_at=WHEN)
    target = tmp_path / rec.path
    os.chmod(target, 0o644)
    target.write_bytes(b"changed")
    with pytest.raises(ValueError, match="does not match"):
        store.read(rec)


@pytest.mark.parametrize("url, ctype, ext", [
    ("https://x/f.xlsx?v=2", None, "xlsx"),
    ("https://x/download", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"),
    ("https://x/page/", "text/html; charset=utf-8", "html"),
    ("https://x/d", "application/geo+json", "geojson"),
    ("https://x/d", "application/json", "json"),
    ("https://x/d", None, "bin"),
])
def test_guess_ext(url, ctype, ext):
    assert guess_ext(url, ctype) == ext
