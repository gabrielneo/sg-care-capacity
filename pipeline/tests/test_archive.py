"""Wayback copies of MOH and NUHS files: which URLs, the Save Page Now flow, and failures recorded."""
from datetime import datetime

import requests

from sg_health.raw import RawRecord
from sg_health.sources.archive import archive_run, read_captures, urls_to_archive

T0 = datetime(2026, 11, 22, 8)


def rec(source, url, at=T0):
    return RawRecord(seq=0, source=source, url=url, sha256="x", bytes=1, http_status=200,
                     content_type="text/html", fetched_at=at, path="p")


class Resp:
    def __init__(self, body):
        self.body = body

    def json(self):
        if isinstance(self.body, Exception):
            raise self.body
        return self.body


class FakeSession:
    """Save Page Now: POST /save gives a job; GET /save/status/<job> answers from `statuses` in turn."""

    def __init__(self, statuses, post=None):
        self.statuses, self.post_body, self.posts = list(statuses), post, []

    def post(self, url, data, headers, timeout):
        self.posts.append((data["url"], headers["Authorization"]))
        if isinstance(self.post_body, Exception):
            raise self.post_body
        return Resp(self.post_body or {"job_id": f"job-{len(self.posts)}"})

    def get(self, url, headers, timeout):
        return Resp(self.statuses.pop(0))


def test_only_this_runs_moh_and_nuhs_urls_once_each_and_never_archive_copies():
    records = [
        rec("moh_bed_waits", "https://www.moh.gov.sg/a.xlsx"),
        rec("moh_bed_waits", "https://www.moh.gov.sg/a.xlsx"),
        rec("nuhs_live", "https://www.nuhs.edu.sg/wait"),
        rec("datagov_chas", "https://data.gov.sg/chas.geojson"),                      # SODL: no copy needed
        rec("moh_page", "https://web.archive.org/web/2024id_/https://www.moh.gov.sg/"),  # already a copy
        rec("moh_page", "https://www.moh.gov.sg/old", at=datetime(2026, 11, 1)),      # an earlier run
    ]
    assert urls_to_archive(records, T0) == ["https://www.moh.gov.sg/a.xlsx", "https://www.nuhs.edu.sg/wait"]


def test_saves_record_the_capture_url_or_null_and_append_to_the_log(tmp_path):
    records = [rec("moh_ed_attendances", "https://www.moh.gov.sg/b.xlsx"), rec("nuhs_live", "https://www.nuhs.edu.sg/wait")]
    session = FakeSession([{"status": "pending"}, {"status": "success", "timestamp": "20261122080500"},
                           {"status": "error", "message": "blocked"}])
    out = archive_run(session, tmp_path, records, T0, access_key="a", secret_key="s", sleep=lambda _: None)
    assert [c["archive_url"] for c in out] == [
        "https://web.archive.org/web/20261122080500/https://www.moh.gov.sg/b.xlsx", None]
    assert session.posts[0][1] == "LOW a:s"
    assert read_captures(tmp_path) == out
    archive_run(session, tmp_path, [], T0, access_key="a", secret_key="s", sleep=lambda _: None)
    assert len(read_captures(tmp_path)) == 2                  # nothing to save: the log is unchanged


def test_a_network_error_or_a_save_that_never_finishes_is_recorded_not_raised(tmp_path):
    one = [rec("nuhs_live", "https://www.nuhs.edu.sg/wait")]
    down = FakeSession([], post=requests.ConnectionError("down"))
    assert archive_run(down, tmp_path, one, T0, access_key="a", secret_key="s", sleep=lambda _: None)[0]["archive_url"] is None
    slow = FakeSession([{"status": "pending"}] * 12)
    assert archive_run(slow, tmp_path, one, T0, access_key="a", secret_key="s", sleep=lambda _: None)[0]["archive_url"] is None
    assert read_captures(tmp_path / "missing") == []
