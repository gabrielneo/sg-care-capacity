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
