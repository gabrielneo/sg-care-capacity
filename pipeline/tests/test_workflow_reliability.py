"""Reliability fixes to the workflows (docs/runbook.md): failure modes found in the Nov 2026 QA/SRE pass."""
import re

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


# ------------------------------------------------------- reliability (R6) #

def test_a_stalled_ingest_times_out_before_the_job_so_raw_history_is_still_archived():
    text = (WF / "weekly.yml").read_text()
    job = int(text.split("timeout-minutes: ", 1)[1].split()[0])
    ingest = steps("weekly.yml")["Ingest"]
    assert "continue-on-error: true" in ingest
    assert int(ingest.split("timeout-minutes: ", 1)[1].split()[0]) <= job - 15


# ------------------------------------------------------ reliability (R10) #

def test_a_daily_alert_checks_release_age_what_the_api_serves_and_overdue_as_of():
    text = (WF / "stale-release.yml").read_text()
    assert 'cron: "0 1 * * *"' in text and "issues: write" in text and "timeout-minutes:" in text
    run = steps("stale-release.yml")["Check the newest release, what the API serves, and as_of"]
    for label in ("stale-release", "api-stale", "data-overdue"):
        assert f"alert {label} " in run
    assert '--label "$1" --state open' in run and "gh issue comment" not in run      # one issue, no daily comments
    assert "/api/v1/health" in run and '"$served" != "$tag"' in run
    assert "sg-health overdue --manifest" in run and "exit $problems" in run


def test_keep_awake_opens_one_api_down_issue_when_the_api_does_not_answer():
    text = (WF / "keep-api-awake.yml").read_text()
    assert "issues: write" in text and "contents: write" not in text
    issue = steps("keep-api-awake.yml")["Open an api-down issue if it didn't answer"]
    assert "failure()" in condition(issue) and "--label api-down --state open" in issue and "gh issue comment" not in issue


# ------------------------------------------------------ reliability (R11) #

def test_every_job_has_a_timeout_and_ci_cancels_superseded_runs():
    import yaml
    for wf in sorted(WF.glob("*.yml")):
        for name, job in yaml.safe_load(wf.read_text())["jobs"].items():
            assert job.get("timeout-minutes"), f"{wf.name}: job {name} has no timeout (default: 6 hours)"
    ci = yaml.safe_load((WF / "ci.yml").read_text())
    assert ci["concurrency"]["cancel-in-progress"] is True and "github.ref" in ci["concurrency"]["group"]


def test_flaky_e2e_tests_are_not_retried():
    from sg_health import config
    text = (config.REPO_ROOT / "web" / "playwright.config.ts").read_text()
    assert re.search(r"^\s*retries: 0,", text, re.M)
