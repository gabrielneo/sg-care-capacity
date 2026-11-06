"""Settings, read from environment variables only. Invalid settings stop the API from starting.

| Variable              | Default                          | Meaning |
|-----------------------|----------------------------------|---------|
| DATA_SNAPSHOT         | latest                           | Release tag to serve, e.g. data-2026-11-06. `latest` = newest data-YYYY-MM-DD release that isn't a pre-release (withdrawn) |
| LOCAL_SNAPSHOT_PATH   | (unset)                          | Serve a local snapshot folder instead of downloading (e.g. data/build/publish). Still verified |
| SNAPSHOT_CACHE_DIR    | <tmp>/sg-health-api              | Where downloaded releases are kept; verified files aren't downloaded again |
| SNAPSHOT_REPO         | gabrielneo/sg-care-capacity      | GitHub repository holding the releases |
| GITHUB_TOKEN          | (unset)                          | Optional; raises GitHub's API rate limit. Sent to api.github.com only |
| CORS_ALLOW_ORIGINS    | (empty: no cross-origin access)  | Comma-separated origins, e.g. https://example.org,http://localhost:3000. `*` is refused |
"""
from __future__ import annotations

import os
import re
import tempfile
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path

TAG_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$")          # also safe as a folder name
ORIGIN_RE = re.compile(r"^https?://[A-Za-z0-9.-]+(:\d{1,5})?$")      # scheme://host[:port], no path


class ConfigError(ValueError):
    """A setting is invalid; the API refuses to start."""


@dataclass(frozen=True)
class Settings:
    data_snapshot: str = "latest"
    local_snapshot_path: Path | None = None
    cache_dir: Path = Path(tempfile.gettempdir()) / "sg-health-api"
    snapshot_repo: str = "gabrielneo/sg-care-capacity"
    github_token: str | None = field(default=None, repr=False)
    cors_allow_origins: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        if self.data_snapshot != "latest" and not TAG_RE.match(self.data_snapshot):
            raise ConfigError(f"DATA_SNAPSHOT {self.data_snapshot!r} is not a release tag")
        if not re.match(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", self.snapshot_repo):
            raise ConfigError(f"SNAPSHOT_REPO {self.snapshot_repo!r} is not owner/name")
        for origin in self.cors_allow_origins:
            if "*" in origin:
                raise ConfigError("CORS_ALLOW_ORIGINS must list origins explicitly; '*' is not allowed")
            if not ORIGIN_RE.match(origin):
                raise ConfigError(f"CORS origin {origin!r} must look like https://host[:port] (no path or slash)")

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> Settings:
        env = os.environ if env is None else env
        local = env.get("LOCAL_SNAPSHOT_PATH", "").strip()
        cache = env.get("SNAPSHOT_CACHE_DIR", "").strip()
        origins = tuple(o.strip() for o in env.get("CORS_ALLOW_ORIGINS", "").split(",") if o.strip())
        return cls(
            data_snapshot=env.get("DATA_SNAPSHOT", "").strip() or "latest",
            local_snapshot_path=Path(local).expanduser() if local else None,
            cache_dir=Path(cache).expanduser() if cache else cls.cache_dir,
            snapshot_repo=env.get("SNAPSHOT_REPO", "").strip() or cls.snapshot_repo,
            github_token=env.get("GITHUB_TOKEN", "").strip() or None,
            cors_allow_origins=origins,
        )
