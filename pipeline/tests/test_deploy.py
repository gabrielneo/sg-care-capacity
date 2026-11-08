"""Deployment config: the Render blueprint and the script that checks a restart worked."""
import json
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest
import yaml

from sg_health import config

ROOT = config.REPO_ROOT
WAIT = ROOT / ".github" / "scripts" / "wait-for-api.sh"


# --------------------------------------------------------------- render.yaml #

@pytest.fixture(scope="module")
def service():
    services = yaml.safe_load((ROOT / "render.yaml").read_text())["services"]
    assert len(services) == 1
    return services[0]


def test_render_builds_the_api_image_on_the_free_plan(service):
    assert (service["type"], service["runtime"], service["plan"]) == ("web", "docker", "free")
    assert (ROOT / service["dockerfilePath"]).resolve() == ROOT / "api" / "Dockerfile"
    assert (ROOT / service["dockerContext"]).resolve() == ROOT / "api"
    assert service["buildFilter"]["paths"] == ["api/**"]


def test_render_checks_the_apis_own_health_route(service):
    assert service["healthCheckPath"] == "/api/v1/health"
    routes = (ROOT / "api" / "sg_health_api" / "routes" / "system.py").read_text()
    assert '"/health"' in routes
    assert "/api/v1/health" in (ROOT / "api" / "Dockerfile").read_text()


def test_render_serves_the_latest_release_and_keeps_secrets_out_of_the_file(service):
    env = {e["key"]: e for e in service["envVars"]}
    assert env["DATA_SNAPSHOT"]["value"] == "latest"
    assert env["SNAPSHOT_REPO"]["value"] == "gabrielneo/sg-care-capacity"
    assert env["GITHUB_TOKEN"] == {"key": "GITHUB_TOKEN", "sync": False}         # set in the dashboard
    assert "CORS_ALLOW_ORIGINS" not in env and "LOCAL_SNAPSHOT_PATH" not in env  # site calls it server-side
    for key, e in env.items():
        if any(w in key for w in ("TOKEN", "KEY", "SECRET")):
            assert "value" not in e, key


# ------------------------------------------------------------ wait-for-api.sh #

@pytest.fixture
def api():
    """A stand-in API whose /api/v1/health serves whichever snapshot the test sets."""
    state = {"snapshot_id": "data-2026-11-01"}

    class Health(BaseHTTPRequestHandler):
        def do_GET(self):
            ok = self.path == "/api/v1/health"
            body = json.dumps({"data": {"status": "ok", "snapshot_id": state["snapshot_id"]}}).encode()
            self.send_response(200 if ok else 404)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(body if ok else b"{}")

        def log_message(self, *args):
            pass

    server = HTTPServer(("127.0.0.1", 0), Health)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_address[1]}/", state
    server.shutdown()


def wait(*args):
    return subprocess.run(["bash", str(WAIT), *args], capture_output=True, text=True, timeout=30)


def test_wait_succeeds_once_the_api_serves_the_expected_release(api):
    url, _ = api
    r = wait(url, "data-2026-11-01", "5", "1")
    assert r.returncode == 0 and "The API serves data-2026-11-01." in r.stdout


def test_wait_waits_for_the_switch_to_the_new_release(api):
    url, state = api
    threading.Timer(1.5, lambda: state.update(snapshot_id="data-2026-11-08")).start()
    r = wait(url, "data-2026-11-08", "10", "1")
    assert r.returncode == 0 and "Waiting: the API serves data-2026-11-01" in r.stdout


def test_wait_fails_the_job_if_the_api_never_serves_it(api):
    url, _ = api
    r = wait(url, "data-2026-11-08", "2", "1")
    assert r.returncode == 1
    assert "::error::After 2s the API serves 'data-2026-11-01', not data-2026-11-08" in r.stdout


def test_wait_fails_if_the_api_cant_be_reached():
    r = wait("http://127.0.0.1:9", "data-2026-11-08", "1", "1")
    assert r.returncode == 1 and "serves 'nothing'" in r.stdout


def test_wait_only_warns_when_the_api_url_isnt_configured():
    r = wait("", "data-2026-11-08")
    assert r.returncode == 0 and "::warning::API_PUBLIC_URL is not set" in r.stdout
