"""Reliability fixes to the workflows (docs/runbook.md): failure modes found in the Nov 2026 QA/SRE pass."""
from test_workflow import WF, condition, steps  # noqa: F401

# ------------------------------------------------------- reliability (R1) #

def test_weekly_never_replaces_a_published_snapshot_in_place_and_finishes_a_leftover_draft():
    # A same-day rerun used to --clobber the live release file by file: an API starting meanwhile found files that
    # didn't match the manifest, and the new content kept the old snapshot_id (the API's ETag). A draft left by a
    # failed upload was never published by the rerun.
    upload = steps("weekly.yml")["Upload snapshot release"]
    assert "isDraft" in upload
    published = upload.split('if [ "$state" = "false" ]', 1)[1].split("elif", 1)[0]
    assert "is already published" in published and "exit 1" in published and "gh release upload" not in published
    draft = upload.split('elif [ "$state" = "true" ]', 1)[1].split("else", 1)[0]
    assert "gh release upload" in draft and "--clobber" in draft and "--draft=false" in draft
    assert "gh release create" in upload.rsplit("else", 1)[1]


# ------------------------------------------------------- reliability (R2) #

def test_weekly_reports_a_partial_ingest_and_any_failed_step_in_one_issue():
    s = steps("weekly.yml")
    ingest = s["Ingest"]
    assert '"$rc" -eq 3' in ingest and "partial=true" in ingest and "PIPESTATUS[0]" in ingest
    issue = s["Open or update the pipeline-failure issue"]
    cond = condition(issue)
    assert "failure()" in cond and "steps.ingest.outputs.partial == 'true'" in cond and "!cancelled()" in cond
    for step in ("test", "restore", "ingest", "validate", "transform", "publish", "upload", "restart", "apicheck"):
        assert f"steps.{step}.outcome" in issue, step
    assert "source_failed" in issue and "When a scheduled run fails" in issue
    assert "gh issue list --label pipeline-failure --state open" in issue and "gh issue comment" in issue
    assert "continue-on-error: true" in issue
    order = list(s)
    assert order.index("Open or update the pipeline-failure issue") < order.index("Fail the job if any stage failed")
    assert "steps.ingest.outputs.partial == 'true'" in condition(s["Fail the job if any stage failed"])


# ------------------------------------------------------- reliability (R5) #

def test_drafts_never_count_as_releases():
    # A failed upload leaves a draft. Prune counted it and deleted a good release; Restart API expected it although the
    # API ignores drafts; the stale alert took it (or a withdrawn pre-release) as fresh.
    prune = steps("weekly.yml")["Keep only the newest snapshots"]
    assert "steps.upload.outcome == 'success'" in condition(prune) and "--exclude-drafts" in prune
    assert "--exclude-drafts" in steps("restart-api.yml")["Work out which data release to expect"]
    stale = (WF / "stale-release.yml").read_text()
    assert "select(.isDraft | not)" in stale and "select(.isPrerelease | not)" in stale and "isDraft,isPrerelease" in stale
