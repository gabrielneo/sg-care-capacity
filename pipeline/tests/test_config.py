"""Default paths resolve from the repo root, and SG_HEALTH_DATA_DIR overrides them."""
import importlib

from sg_health import config


def test_default_paths_live_under_repo_data_dir():
    assert (config.REPO_ROOT / "CLAUDE.md").exists()
    assert config.DEFAULT_DB == config.REPO_ROOT / "data" / "build" / "warehouse.duckdb"
    assert config.RAW_DIR == config.REPO_ROOT / "data" / "raw"


def test_data_dir_env_override(monkeypatch, tmp_path):
    monkeypatch.setenv("SG_HEALTH_DATA_DIR", str(tmp_path))
    try:
        reloaded = importlib.reload(config)
        assert reloaded.DEFAULT_DB == tmp_path / "build" / "warehouse.duckdb"
        assert reloaded.RAW_DIR == tmp_path / "raw"
    finally:
        monkeypatch.delenv("SG_HEALTH_DATA_DIR")
        importlib.reload(config)
