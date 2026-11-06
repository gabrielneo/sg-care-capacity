"""Shared fixtures: one fixture snapshot per test session, copied per test when it will be changed."""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))

import fixture_snapshot  # noqa: E402

from sg_health_api.config import Settings  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="session")
def snapshot_dir(tmp_path_factory) -> Path:
    """The fixture snapshot, built once. Read-only: copy it (fresh_snapshot) before changing it."""
    return fixture_snapshot.build(tmp_path_factory.mktemp("snapshot"))


@pytest.fixture
def fresh_snapshot(snapshot_dir, tmp_path) -> Path:
    """A private copy of the fixture snapshot that a test may break."""
    return Path(shutil.copytree(snapshot_dir, tmp_path / "snap"))


@pytest.fixture
def local_settings(snapshot_dir) -> Settings:
    return Settings(local_snapshot_path=snapshot_dir)
