"""Every registered check is documented in docs/data_quality.md, and nothing documented is stale."""
import re

from sg_health import config
from sg_health.quality import validate  # noqa: F401  (imports every module that registers checks)
from sg_health.quality.model import CHECKS

DOC = (config.REPO_ROOT / "docs" / "data_quality.md").read_text()


def test_every_check_has_a_section_with_its_severity():
    for check in CHECKS.values():
        heading = re.search(rf"^### .*`{re.escape(check.check_id)}`: ([A-Z]+)", DOC, re.M)
        assert heading, f"{check.check_id} is not documented in docs/data_quality.md"
        assert heading.group(1) == check.severity.value, f"{check.check_id}: doc says {heading.group(1)}"


def test_no_documented_check_is_missing_from_code():
    documented = set(re.findall(r"`((?:schema|domain|range|unit|completeness|freshness|clinic|reconcile)\.[a-z0-9_]+)`", DOC))
    assert documented <= set(CHECKS), f"documented but not in code: {sorted(documented - set(CHECKS))}"
