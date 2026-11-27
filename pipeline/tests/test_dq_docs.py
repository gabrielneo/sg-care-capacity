"""Every registered check is documented in docs/data_quality.md, and nothing documented is stale."""
import re

from sg_health import config
from sg_health.quality import validate  # noqa: F401  (imports every module that registers checks)
from sg_health.quality.model import CHECKS

DOC = (config.REPO_ROOT / "docs" / "data_quality.md").read_text()
README = (config.REPO_ROOT / "README.md").read_text()
TYPES = re.compile(r"(\d+) types of data check")


def test_every_check_has_a_section_with_its_severity():
    for check in CHECKS.values():
        heading = re.search(rf"^### .*`{re.escape(check.check_id)}`: ([A-Z]+)", DOC, re.M)
        assert heading, f"{check.check_id} is not documented in docs/data_quality.md"
        assert heading.group(1) == check.severity.value, f"{check.check_id}: doc says {heading.group(1)}"


def test_no_documented_check_is_missing_from_code():
    documented = set(re.findall(r"`((?:schema|domain|range|unit|completeness|freshness|clinic|reconcile|reference|live|population|boundary|holiday|polyclinic)\.[a-z0-9_]+)`", DOC))
    assert documented <= set(CHECKS), f"documented but not in code: {sorted(documented - set(CHECKS))}"


def test_readme_and_this_page_state_the_registered_number_of_check_types():
    for name, text in (("README.md", README), ("docs/data_quality.md", DOC)):
        stated = {int(n) for n in TYPES.findall(text)}
        assert stated == {len(CHECKS)}, f"{name} says {sorted(stated)} types of data check; the registry has {len(CHECKS)}"


def test_readme_does_not_hard_code_a_per_release_check_count():
    # The number run varies by release (tables, skipped findings); the site's Data Quality page shows it.
    assert not re.search(r"\b\d+ (?:data )?checks (?:ran|run|passed)\b|\b\d+ data checks\b", README)
