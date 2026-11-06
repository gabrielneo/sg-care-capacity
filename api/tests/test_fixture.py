"""The fixture snapshot has exactly the mart columns documented in docs/data_dictionary.md.

The pipeline's tests hold the real marts to the same document, so a mart change that isn't
reflected in the fixture (and so in these API tests) fails here.
"""
import re

import duckdb
import pytest
from conftest import REPO_ROOT
from fixture_snapshot import DDL


def documented_columns(mart: str) -> set[str]:
    doc = (REPO_ROOT / "docs" / "data_dictionary.md").read_text()
    section = re.search(rf"^### `marts\.{mart}`\n(.*?)(?=^##)", doc, re.S | re.M)
    assert section, f"marts.{mart} has no section in docs/data_dictionary.md"
    cols: set[str] = set()
    for line in section.group(1).splitlines():
        if line.startswith("| `"):
            cols |= set(re.findall(r"`([a-z0-9_]+)`", line.split("|")[1]))
    return cols


@pytest.mark.parametrize("mart", sorted(DDL))
def test_fixture_matches_the_data_dictionary(snapshot_dir, mart):
    con = duckdb.connect(str(snapshot_dir / "analytics.duckdb"), read_only=True)
    try:
        actual = {r[0] for r in con.execute(f"DESCRIBE marts.{mart}").fetchall()}
    finally:
        con.close()
    assert actual == documented_columns(mart)
