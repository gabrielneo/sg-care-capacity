"""Settings come from the environment; anything unsafe stops the API from starting."""
from pathlib import Path

import pytest

from sg_health_api.config import ConfigError, Settings


def test_defaults_serve_the_latest_release_with_no_cross_origin_access():
    s = Settings.from_env({})
    assert (s.data_snapshot, s.local_snapshot_path, s.cors_allow_origins) == ("latest", None, ())
    assert s.snapshot_repo == "gabrielneo/sg-care-capacity" and s.github_token is None


def test_values_are_read_and_trimmed():
    s = Settings.from_env({"DATA_SNAPSHOT": " data-2026-11-01 ", "LOCAL_SNAPSHOT_PATH": "/tmp/snap",
                           "CORS_ALLOW_ORIGINS": "https://a.example, http://localhost:3000 ,", "GITHUB_TOKEN": "ghp_SECRET123"})
    assert s.data_snapshot == "data-2026-11-01" and s.local_snapshot_path == Path("/tmp/snap")
    assert s.cors_allow_origins == ("https://a.example", "http://localhost:3000")
    assert "ghp_SECRET123" not in repr(s) and s.github_token == "ghp_SECRET123"                                             # the token never appears in logs


@pytest.mark.parametrize("origins", ["*", "https://*.example.org", "https://a.example/", "a.example", "null"])
def test_wildcard_or_malformed_cors_origins_are_refused(origins):
    with pytest.raises(ConfigError):
        Settings.from_env({"CORS_ALLOW_ORIGINS": origins})


@pytest.mark.parametrize("tag", ["../etc", "data 2026", "a/b"])
def test_a_snapshot_tag_that_isnt_a_plain_name_is_refused(tag):
    with pytest.raises(ConfigError):
        Settings.from_env({"DATA_SNAPSHOT": tag})
