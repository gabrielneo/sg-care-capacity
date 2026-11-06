"""Default paths resolve from the repo root, and SG_HEALTH_DATA_DIR overrides them."""
import os
import subprocess
import sys

from sg_health import config


def test_default_paths_live_under_repo_data_dir():
    assert (config.REPO_ROOT / "CLAUDE.md").exists()
    assert config.DEFAULT_DB == config.REPO_ROOT / "data" / "build" / "warehouse.duckdb"
    assert config.RAW_DIR == config.REPO_ROOT / "data" / "raw"


def test_data_dir_env_override(tmp_path):
    # In a fresh interpreter: reloading sg_health.config in-process would leave other modules
    # holding the old objects and leak state into later tests.
    out = subprocess.run(
        [sys.executable, "-c", "from sg_health import config; print(config.DEFAULT_DB); print(config.RAW_DIR)"],
        env={**os.environ, "SG_HEALTH_DATA_DIR": str(tmp_path)}, capture_output=True, text=True, check=True,
        cwd=os.path.dirname(os.path.dirname(__file__)))
    assert out.stdout.splitlines() == [str(tmp_path / "build" / "warehouse.duckdb"), str(tmp_path / "raw")]
