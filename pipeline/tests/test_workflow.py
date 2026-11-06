"""The GitHub Actions workflows keep their safety properties. They can't run here, so their shape is
checked: raw history is archived even when later stages fail, publishing needs every gate, a failed
validation opens an issue, the live job never publishes a snapshot, and CI runs on pushes to main."""
import re

from sg_health import config

WF = config.REPO_ROOT / ".github" / "workflows"


def steps(name: str) -> dict[str, str]:
    text = (WF / name).read_text()
    blocks = re.split(r"\n      - (?:name: |uses: )", text.split("    steps:", 1)[1])[1:]
    return {b.splitlines()[0].strip(): b for b in blocks}


def condition(block: str) -> str:
    m = re.search(r"if: \$\{\{(.*?)\}\}", block, re.S)
    return m.group(1) if m else ""


# ------------------------------------------------------------------- weekly #

def test_weekly_runs_sundays_and_its_stages_are_in_order():
    text = (WF / "weekly.yml").read_text()
    assert 'cron: "0 0 * * 0"' in text and not (WF / "weekly_scraper.yml").exists()
    order = list(steps("weekly.yml"))
    for a, b in [("Test", "Ingest"), ("Ingest", "Upload data/raw to the release"),
                 ("Upload data/raw to the release", "Validate"), ("Validate", "Transform"),
                 ("Transform", "Publish snapshot"), ("Publish snapshot", "Upload snapshot release"),
                 ("Upload snapshot release", "Keep only the newest snapshots"),
                 ("Upload snapshot release", "Fail the job if any stage failed")]:
        assert order.index(a) < order.index(b), (a, b)


def test_weekly_archives_raw_history_even_when_later_stages_fail():
    s = steps("weekly.yml")
    assert "continue-on-error: true" in s["Ingest"]
    for name in ("Check data/raw only grew", "Upload data/raw to the release"):
        cond = condition(s[name])
        assert "!cancelled()" in cond and "steps.restore.outcome == 'success'" in cond
        assert "steps.ingest" not in cond and "steps.validate" not in cond and "steps.transform" not in cond


def test_weekly_publishes_only_when_every_gate_passed():
    s = steps("weekly.yml")
    cond = condition(s["Publish snapshot"])
    for gate in ("steps.ingest.outcome == 'success'", "steps.validate.outcome == 'success'",
                 "steps.transform.outcome == 'success'"):
        assert gate in cond
    assert "verify_manifest" in s["Publish snapshot"]
    for name in ("Upload snapshot release", "Keep only the newest snapshots"):
        assert "steps.publish.outcome == 'success'" in condition(s[name])
    assert "snapshots-to-prune" in s["Keep only the newest snapshots"]


def test_weekly_opens_an_issue_when_validation_fails():
    s = steps("weekly.yml")
    issue = s["Open or update the data-quality issue"]
    assert "steps.validate.outcome == 'failure'" in condition(issue)
    assert "gh issue comment" in issue and "gh issue create" in issue and "dq.md" in issue
    assert "--markdown" in s["Validate"]
    assert "issues: write" in (WF / "weekly.yml").read_text()


def test_weekly_fails_the_job_after_archiving_if_any_stage_failed():
    fail = steps("weekly.yml")["Fail the job if any stage failed"]
    for stage in ("ingest", "validate", "transform", "publish"):
        assert f"steps.{stage}.outcome == 'failure'" in fail
    assert "exit 1" in fail


# --------------------------------------------------------------------- live #

def test_live_runs_every_3_hours_into_its_own_store_and_never_publishes():
    text = (WF / "live.yml").read_text()
    assert re.search(r'cron: "\d+ \*/3 \* \* \*"', text)
    assert "--sources live" in text and "SG_HEALTH_DATA_DIR" in text and "live-latest" in text
    assert "sg-health publish" not in text and "data-latest" not in text and "RAW_RELEASE_TAG" not in text
    assert "group: live-store" in text


# ----------------------------------------------------------------------- ci #

def test_ci_runs_on_pull_requests_and_pushes_to_main_with_lint_types_and_tests():
    text = (WF / "ci.yml").read_text()
    assert "pull_request:" in text and re.search(r"push:\s*\n\s*branches: \[main\]", text)
    for cmd in ("ruff check .", "mypy", "pytest -q tests"):
        assert cmd in text
    assert "duckdb" in text and "parquet" in text                       # binary data guard
    for job in ("pipeline:", "api:", "web:"):
        assert f"\n  {job}" in text
    e2e = text.split("\n  e2e:", 1)[1]
    for cmd in ("pip install -e ../api", "npx playwright install --with-deps chromium", "npm run e2e"):
        assert cmd in e2e
    web = text.split("\n  web:", 1)[1].split("\n  e2e:", 1)[0]
    for cmd in ("npm ci", "npm run check:api-types", "npm run lint", "npm run typecheck", "npm test", "npm run build"):
        assert cmd in web


# ----------------------------------------------------------------- Makefile #

def test_make_test_runs_every_suite_separately():
    import shutil
    import subprocess

    import pytest
    if shutil.which("make") is None:
        pytest.skip("make is not installed")
    out = subprocess.run(["make", "-n", "test", "PYTHON=python3"], cwd=config.REPO_ROOT,
                         capture_output=True, text=True, check=True).stdout.splitlines()
    assert out == ["python3 -m pytest -q pipeline/tests", "python3 -m pytest -q api", "cd web && npm test",
                   "python3 -m pytest -q pipeline/acceptance"]
