# Run from the repo root. The pipeline, API and web are separate projects with separate test suites,
# so plain `pytest` at the root is not supported (their test modules share names); use these.
#
#   make test              every suite, in order; stops at the first one that fails
#   make test-pipeline     pipeline unit tests (offline, fixtures)
#   make test-api          API tests (fixture snapshot, contract, openapi.json drift)
#   make test-web          web tests (Vitest); needs `npm ci` in web/ once
#   make test-acceptance   real built data (skips if data/build/warehouse.duckdb isn't built)
#   make e2e               Playwright end to end (real API on its fixture snapshot; builds the site)
#   make lint              ruff and mypy (pipeline, api); eslint and tsc (web)
#   make check             lint, then test (what CI runs, minus the Docker smoke test)

PYTHON ?= $(if $(wildcard .venv/bin/python),.venv/bin/python,python3)
# lint runs inside pipeline/ and api/, so a relative venv path is made absolute (and quoted: the
# repo path may contain spaces). A bare command such as python3 is left to PATH.
RUN = $(if $(filter /%,$(PYTHON)),"$(PYTHON)",$(if $(findstring /,$(PYTHON)),"$(CURDIR)/$(PYTHON)",$(PYTHON)))

.PHONY: test test-pipeline test-api test-web test-acceptance e2e lint check

test: test-pipeline test-api test-web test-acceptance

test-pipeline:
	$(PYTHON) -m pytest -q pipeline/tests

test-api:
	$(PYTHON) -m pytest -q api

test-web:
	cd web && npm test

e2e:
	cd web && npm run e2e

test-acceptance:
	$(PYTHON) -m pytest -q pipeline/acceptance

lint:
	cd pipeline && $(RUN) -m ruff check . && $(RUN) -m mypy
	cd api && $(RUN) -m ruff check . && $(RUN) -m mypy
	cd web && npm run lint && npm run typecheck

check: lint test
