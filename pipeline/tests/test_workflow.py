"""The weekly workflow must archive data/raw even when the pipeline fails (first CI run, 2026-11-06,
lost a week's downloads because the upload only ran after a successful `sg-health run`)."""
import re

from sg_health import config

WORKFLOW = (config.REPO_ROOT / ".github" / "workflows" / "weekly_scraper.yml").read_text()


def steps() -> dict[str, str]:
    blocks = re.split(r"\n      - name: ", WORKFLOW.split("    steps:", 1)[1])[1:]
    return {b.splitlines()[0].strip(): b for b in blocks}


def test_pipeline_steps_cannot_stop_the_job_before_the_archive():
    s = steps()
    for name in ("Rebuild the warehouse from data/raw", "Run pipeline"):
        assert "continue-on-error: true" in s[name], name


def test_archive_runs_after_a_failed_pipeline_but_never_after_a_failed_restore():
    s = steps()
    for name in ("Check data/raw only grew", "Upload data/raw to the release"):
        cond = re.search(r"if: \$\{\{(.*?)\}\}", s[name]).group(1)
        assert "!cancelled()" in cond and "steps.restore.outcome == 'success'" in cond, name
        assert "steps.run" not in cond and "steps.reparse" not in cond, f"{name} must not depend on the pipeline"
    assert "steps.grew.outcome == 'success'" in s["Upload data/raw to the release"]


def test_a_failed_pipeline_still_fails_the_job_after_the_archive():
    names = list(steps())
    assert names.index("Fail the job if the pipeline failed") > names.index("Upload data/raw to the release")
    fail = steps()["Fail the job if the pipeline failed"]
    assert "steps.run.outcome == 'failure'" in fail and "steps.reparse.outcome == 'failure'" in fail and "exit 1" in fail
