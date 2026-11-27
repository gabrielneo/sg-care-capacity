"""R10: the daily alert names the weekly sources whose as_of in the newest release is overdue (docs/datasets.yml)."""
import json
from datetime import date

from sg_health import cli
from sg_health.freshness import overdue_sources

MANIFEST = {"snapshot_id": "data-2026-11-29", "sources": {
    "moh_bed_waits": {"as_of": "2026-10-20"},                 # 40 days on 29 Nov: past 35 -> overdue
    "moh_ed_attendances": {"as_of": "2026-11-15"},            # 14 days: fine
    "nuhs_live": {"as_of": "2026-11-28T12:01:49"},            # 1 day: due, not overdue
    "datagov_chas": {"as_of": "2024-06-06T14:36:42"},         # overdue, but irregular: the publisher's pace, not ours
    "singstat_residents": {"as_of": None},
}}


def test_only_weekly_and_live_sources_past_their_overdue_limit_are_named():
    assert overdue_sources(MANIFEST, date(2026, 11, 29)) == [("moh_bed_waits", "2026-10-20")]
    assert overdue_sources(MANIFEST, date(2026, 11, 20)) == []


def test_the_command_prints_them_and_exits_1(tmp_path, capsys):
    path = tmp_path / "manifest.json"
    path.write_text(json.dumps(MANIFEST))
    assert cli.main(["overdue", "--manifest", str(path), "--today", "2026-11-29"]) == 1
    assert capsys.readouterr().out.strip() == "moh_bed_waits as_of 2026-10-20 is overdue"
    assert cli.main(["overdue", "--manifest", str(path), "--today", "2026-11-20"]) == 0
