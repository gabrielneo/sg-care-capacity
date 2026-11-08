"""Every setting the code reads is documented in .env.example, and no example holds a secret.

Scans the pipeline, the API, the web app and the workflows (and render.yaml, if present) for the
environment variables they read, so a new setting can't ship undocumented."""
import re

import pytest

from sg_health import config

ROOT = config.REPO_ROOT
EXAMPLE = ROOT / ".env.example"
WEB_EXAMPLE = ROOT / "web" / ".env.example"

# Set by the platform or the test harness, never by the operator.
NOT_SETTINGS = {
    "GITHUB_SHA": "set by GitHub Actions (the pipeline records the commit)",
    "CI": "set by CI runners",
    "NODE_ENV": "set by Next.js",
    "E2E_PYTHON": "test harness only (web/e2e/start-api.sh)",
    "E2E_API_PORT": "test harness only",
}

PY = re.compile(r"""(?:os\.getenv|os\.environ\.get|env\.get)\(\s*["']([A-Z][A-Z0-9_]+)["']|os\.environ\[["']([A-Z][A-Z0-9_]+)["']\]""")
JS = re.compile(r"\b(?:process\.)?env\.([A-Z][A-Z0-9_]+)\b")
GHA = re.compile(r"\$\{\{\s*(?:secrets|vars)\.([A-Z][A-Z0-9_]+)\s*\}\}")
RENDER = re.compile(r"-\s*key:\s*([A-Z][A-Z0-9_]+)")


def read(paths):
    return "\n".join(p.read_text() for p in paths)


def names(pattern, text):
    return {n for m in pattern.finditer(text) for n in m.groups() if n}


def documented(path):
    return set(re.findall(r"^#?\s?([A-Z][A-Z0-9_]+)=", path.read_text(), re.M))


def web_sources():
    return [p for d in ("app", "lib", "components") for p in (ROOT / "web" / d).rglob("*.ts*")
            if ".test." not in p.name and "node_modules" not in p.parts]


def used():
    py = names(PY, read([*(ROOT / "pipeline" / "sg_health").rglob("*.py"), *(ROOT / "api" / "sg_health_api").rglob("*.py")]))
    web = names(JS, read(web_sources()))
    gha = names(GHA, read((ROOT / ".github" / "workflows").glob("*.yml"))) - {"GITHUB_TOKEN"}  # provided by Actions
    render = names(RENDER, (ROOT / "render.yaml").read_text()) if (ROOT / "render.yaml").exists() else set()
    return py, web, gha, render


def test_the_scan_finds_the_known_settings():
    py, web, gha, _ = used()
    assert {"DATAGOV_API_KEY", "DATA_SNAPSHOT", "CORS_ALLOW_ORIGINS", "SG_HEALTH_DATA_DIR"} <= py
    assert {"API_BASE_URL", "API_REVALIDATE_SECONDS", "SHOW_DEV_PAGES"} <= web
    assert "DATAGOV_API_KEY" in gha


@pytest.mark.parametrize("group", ["pipeline and API", "web", "workflows", "render.yaml"])
def test_every_setting_read_is_in_env_example(group):
    py, web, gha, render = used()
    found = {"pipeline and API": py, "web": web, "workflows": gha, "render.yaml": render}[group]
    missing = sorted(found - set(NOT_SETTINGS) - documented(EXAMPLE))
    assert not missing, f"add {missing} to .env.example with a description"


def test_the_web_example_lists_every_web_setting():
    _, web, _, _ = used()
    assert sorted(web - set(NOT_SETTINGS) - documented(WEB_EXAMPLE)) == []


def test_every_documented_setting_has_a_description():
    lines = EXAMPLE.read_text().splitlines()
    for i, line in enumerate(lines):
        if re.match(r"^#?\s?[A-Z][A-Z0-9_]+=", line):
            assert i > 0 and lines[i - 1].startswith("#") and not re.match(r"^#?\s?[A-Z][A-Z0-9_]+=", lines[i - 1]), line


@pytest.mark.parametrize("path", [EXAMPLE, WEB_EXAMPLE], ids=["root", "web"])
def test_no_example_holds_a_secret_value(path):
    for line in path.read_text().splitlines():
        m = re.match(r"^#?\s?([A-Z][A-Z0-9_]+)=(.*)$", line)
        if m and re.search(r"KEY|TOKEN|SECRET|HOOK", m.group(1)):
            assert m.group(2).strip() == "", f"{m.group(1)} must be empty in {path.name}"
