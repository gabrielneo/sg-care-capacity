"""Contract: every endpoint answers {data, meta} with meta.as_of, matching its declared model.

The endpoint list comes from the OpenAPI schema, so a new endpoint is covered automatically.
`pytest -m snapshot` runs the same contract against a real snapshot in LOCAL_SNAPSHOT_PATH.
"""
import ast
import os
from datetime import datetime
from pathlib import Path

import pytest
from conftest import REPO_ROOT
from fastapi.testclient import TestClient

from sg_health_api import models as m
from sg_health_api.config import Settings
from sg_health_api.main import create_app
from sg_health_api.openapi import render, schema

EXPECTED = {
    "/api/v1/meta": m.MetaResponse, "/api/v1/health": m.HealthResponse, "/api/v1/hospitals": m.HospitalsResponse,
    "/api/v1/ed/daily": m.EdDailyResponse, "/api/v1/ed/weekly": m.EdWeeklyResponse,
    "/api/v1/ed/summary": m.EdSummaryResponse, "/api/v1/clinics": m.ClinicsResponse,
    "/api/v1/areas/access": m.AreasResponse, "/api/v1/quality": m.QualityResponse,
    "/api/v1/live/nuhs/latest": m.LiveResponse,
}
META_KEYS = {"snapshot_id", "as_of", "sources", "coverage", "caveats", "dq_warnings"}


def test_the_schema_lists_exactly_these_endpoints_each_with_its_model():
    paths = schema()["paths"]
    assert set(paths) == set(EXPECTED), "a new endpoint must be added to EXPECTED (and so to the contract)"
    for path, model in EXPECTED.items():
        ref = paths[path]["get"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"]
        assert ref.endswith("/" + model.__name__), path


def check_contract(client: TestClient) -> None:
    for path, model in sorted(EXPECTED.items()):
        r = client.get(path)
        assert r.status_code == 200, (path, r.text[:300])
        body = r.json()
        assert set(body) == {"data", "meta"}, path
        assert set(body["meta"]) == META_KEYS, path
        assert body["meta"]["as_of"], f"{path}: meta.as_of is empty"
        datetime.fromisoformat(body["meta"]["as_of"])                      # a real ISO 8601 date or time
        model.model_validate(body)                                         # matches the documented model


def test_every_endpoint_returns_meta_as_of(client):
    check_contract(client)


@pytest.mark.snapshot
def test_every_endpoint_returns_meta_as_of_on_the_real_snapshot():
    path = os.environ.get("LOCAL_SNAPSHOT_PATH")
    if not path:
        pytest.skip("set LOCAL_SNAPSHOT_PATH to a published snapshot, e.g. data/build/publish")
    with TestClient(create_app(Settings(local_snapshot_path=Path(path)))) as client:
        check_contract(client)


def test_every_endpoint_documents_its_400_error_shape_where_it_takes_parameters():
    for path, ops in schema()["paths"].items():
        op = ops["get"]
        if op.get("parameters"):
            assert "400" in op["responses"], path


def test_committed_openapi_json_is_up_to_date():
    committed = (REPO_ROOT / "api" / "openapi.json").read_text()
    assert committed == render(), "run: python -m sg_health_api.openapi > api/openapi.json"


# --------------------------------------------------------- parameterised SQL #

PACKAGE = REPO_ROOT / "api" / "sg_health_api"
# The one query built from a string: a table name from the verified manifest, checked against the
# catalogue first (snapshot.open_database). Request parameters never reach it.
ALLOWED = {("snapshot.py", "open_database")}
# Helpers that pass their `sql` argument through; every call to them must pass a constant.
PASS_THROUGH = {"query": 0, "static": 2}


def _sql_calls(tree: ast.Module):
    for fn in ast.walk(tree):
        if isinstance(fn, ast.FunctionDef):
            for node in ast.walk(fn):
                if (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
                        and node.func.attr in ("execute", "query") and node.args):
                    yield fn.name, node


def test_all_sql_is_a_constant_and_values_go_in_as_parameters():
    problems = []
    for path in PACKAGE.rglob("*.py"):
        tree = ast.parse(path.read_text())
        constants = {t.id: node.value for node in tree.body if isinstance(node, ast.Assign)
                     for t in node.targets if isinstance(t, ast.Name)}
        for name, value in constants.items():
            if name.endswith("_SQL") and any(isinstance(n, ast.JoinedStr) for n in ast.walk(value)):
                problems.append(f"{path.name}: {name} is an f-string")
        for fn, call in _sql_calls(tree):
            sql = call.args[0]
            ok = constant(sql) or (isinstance(sql, ast.Name) and sql.id == "sql" and fn in PASS_THROUGH)
            if not ok and (path.name, fn) not in ALLOWED:
                problems.append(f"{path.name}:{call.lineno} in {fn}: SQL is not a constant")
        for node in ast.walk(tree):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "static":
                if not constant(node.args[PASS_THROUGH["static"]]):
                    problems.append(f"{path.name}:{node.lineno}: static() called without a constant")
    assert problems == []


def constant(node: ast.expr) -> bool:
    return (isinstance(node, ast.Constant) and isinstance(node.value, str)) or (
        isinstance(node, ast.Name) and node.id.isupper())
