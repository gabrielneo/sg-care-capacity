"""Print the OpenAPI schema: python -m sg_health_api.openapi > api/openapi.json

Builds the app without loading a snapshot (the schema doesn't depend on the data).
"""
from __future__ import annotations

import json
import sys
from typing import Any

from .config import Settings
from .main import create_app


def schema() -> dict[str, Any]:
    return create_app(Settings()).openapi()


def render() -> str:
    return json.dumps(schema(), indent=2, sort_keys=True, ensure_ascii=False) + "\n"


if __name__ == "__main__":
    sys.stdout.write(render())
