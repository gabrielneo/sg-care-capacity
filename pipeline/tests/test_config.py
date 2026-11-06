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


# ------------------------------------------------------------------ .env loading #


import pytest  # noqa: E402

TEST_KEYS = ("SGH_TEST_A", "SGH_TEST_B", "SGH_TEST_E")


@pytest.fixture
def clean_env(monkeypatch):
    for k in TEST_KEYS:
        monkeypatch.delenv(k, raising=False)
    yield monkeypatch
    for k in TEST_KEYS:                       # load_dotenv writes os.environ directly: undo it
        os.environ.pop(k, None)


def test_local_env_file_is_loaded(tmp_path, clean_env):
    (tmp_path / ".env").write_text('# comment\nSGH_TEST_A=plain\nexport SGH_TEST_B="quoted value"\n')
    assert config.load_local_env(tmp_path / ".env")
    assert os.environ["SGH_TEST_A"] == "plain" and os.environ["SGH_TEST_B"] == "quoted value"


def test_a_real_environment_variable_wins_over_the_file(tmp_path, clean_env):
    clean_env.setenv("SGH_TEST_E", "from-ci-secret")
    (tmp_path / ".env").write_text("SGH_TEST_E=from-file\n")
    config.load_local_env(tmp_path / ".env")
    assert os.environ["SGH_TEST_E"] == "from-ci-secret"


def test_no_env_file_is_fine(tmp_path):
    assert config.load_local_env(tmp_path / "nope.env") is False


def test_env_file_is_git_ignored_and_the_example_has_no_secret():
    assert ".env" in (config.REPO_ROOT / ".gitignore").read_text().splitlines()
    assert "DATAGOV_API_KEY=\n" in (config.REPO_ROOT / ".env.example").read_text()
