# Runbook

How the data is collected, checked and released, and what to do when something goes wrong.
Commands assume the repo root and an installed pipeline (`pip install -e "pipeline[dev]"`). GitHub
commands use the [`gh` CLI](https://cli.github.com/); everything can also be done in the web UI.

## What runs, and where data lives

| Workflow | When | What it does | Where its output lives |
|---|---|---|---|
| `weekly.yml` | Sundays 00:00 UTC (08:00 SGT), or **Actions → Weekly pipeline → Run workflow** | test → ingest → validate → transform → publish → restart the API and check it serves the new release | Raw history: release **`data-latest`** (`raw.tar.gz`). Snapshots: releases **`data-YYYY-MM-DD`** (newest 12 kept) |
| `live.yml` | Every 3 hours (at :15) | NUHS live waits only, into a separate store | Release **`live-latest`** (`live.tar.gz`, `nuhs_live_waits.parquet`). Never a snapshot |
| `ci.yml` | Every pull request and push to `main` | ruff, mypy, unit tests; guards against committed binaries or `.env` | Nothing (checks only) |
| `restart-api.yml` | By hand: **Actions → Restart API → Run workflow** | Restarts the API (Render deploy hook) and checks which data release it serves; or only checks | Nothing |

**Where the site runs:** the API on [Render](https://render.com) (`render.yaml`, free plan, Singapore
region), the website on [Vercel](https://vercel.com) (`web/`). The website calls the API from its
server only, so the API allows no browser origins. See [Deploying](#deploying).

- **`data-latest` is history, not a snapshot.** It holds every raw file ever downloaded. Never delete it:
  without it the next weekly run starts from nothing, and MOH only shows its latest week.
- **No database is ever committed to git.** Snapshots are release assets. CI fails if a `.duckdb`,
  `.parquet`, `.xlsx`, `.db` or `.sqlite` file is tracked.

## The weekly release, step by step

1. **Test**: the offline unit tests. A failure stops the run before any data is touched.
2. **Restore** `data/raw` from `data-latest`. If that release exists but can't be downloaded, the run
   stops: continuing with an empty folder would overwrite history.
3. **Ingest**: `sg-health reparse` rebuilds the clean tables from history, then `sg-health run` fetches
   this week's MOH, NUHS, data.gov.sg and SingStat (from the committed reference file). A source being
   down doesn't stop the run.
4. **Archive raw history, always**: if the manifest didn't shrink, `raw.tar.gz` is re-uploaded to
   `data-latest`, even if a later step fails.
5. **Validate**: `sg-health validate`. If any check **blocks publishing** (an ERROR at file or dataset
   level, e.g. stale data, a unit error, missing population), nothing is published and an **issue
   labelled `data-quality`** lists the failing checks (a new comment if one is already open).
   Quarantined rows (row-level ERRORs) don't block; they are excluded from the marts and counted in
   the manifest. See [data_quality.md](data_quality.md).
6. **Transform**: `sg-health transform` builds the marts and the web GeoJSON.
7. **Publish**, only if ingest, validate and transform all succeeded: `sg-health publish` re-runs
   validation (and refuses if anything blocks), then writes into `data/build/publish/`:
   - `analytics.duckdb`: **only** the marts plus `dq_results`, built fresh, checkpointed, read-only;
   - `parquet/<mart>.parquet` for every mart;
   - `planning_area_access.geojson`;
   - `manifest.json`: `snapshot_id`, `as_of` per source, row counts, coverage per hospital, check
     summary, SHA-256 and size of every file, pipeline git commit.

   The run verifies every hash, then uploads the files to release **`data-YYYY-MM-DD`**. Parquet files
   are uploaded under their mart name (`fct_ed_daily.parquet`); in the manifest they appear as
   `parquet/fct_ed_daily.parquet`. A second run on the same day **replaces** that day's files.
   The snapshot also carries `insights.json` and `marts.fct_insight` from the insight engine
   ([insights_method.md](insights_method.md)). Skipped detectors are logged in `dq_results` as
   `insight.*`; they never block publishing.
8. **Prune**: snapshot releases beyond the newest 12 are deleted (`sg-health snapshots-to-prune`).
   `data-latest`, `live-latest` and any other tag are never touched.
   **Restart the API**: the workflow calls Render's deploy hook, then waits (up to 20 minutes) until
   `/api/v1/health` reports the new `snapshot_id`. If it never does, the job fails; the API keeps
   serving the previous release. Without the `RENDER_DEPLOY_HOOK_URL` secret this is skipped with a
   notice. The website picks up the new figures within an hour (its cache, `API_REVALIDATE_SECONDS`).
9. **Fail the job** if any stage failed, after the archive is safe, so GitHub emails you.

### Run it by hand

```bash
sg-health reparse --no-transform --no-report      # rebuild clean tables from data/raw
sg-health run --no-validate --no-transform        # fetch new data
sg-health validate                                # exit 1 = publishing blocked
sg-health transform
sg-health publish                                 # -> data/build/publish/ (exit 1 if blocked)
```

### Check a published snapshot

```bash
gh release download data-2026-11-08 --dir snap && cd snap
python - <<'PY'
import hashlib, json
m = json.load(open("manifest.json"))
for rel, meta in m["artefacts"].items():
    name = rel.split("/")[-1]                        # parquet/ prefix is dropped in release assets
    ok = hashlib.sha256(open(name, "rb").read()).hexdigest() == meta["sha256"]
    print(("OK  " if ok else "BAD ") + rel)
PY
```

Open the database read-only: `duckdb -readonly analytics.duckdb` (the file is also read-only on disk).

## When publishing is blocked

1. Open the `data-quality` issue (or the run's **Validate** step log) to see which checks block.
2. Look each one up in [data_quality.md](data_quality.md), section *Fixing a failure*:
   - **Source problem** (MOH late, a source down): usually fixes itself next week; check `freshness.*`.
   - **Parser problem** (a source changed layout): fix the parser, add a test, push, then run the
     workflow by hand. `reparse` re-parses all history with the fix.
3. The site keeps serving the **last published snapshot** in the meantime. Nothing to roll back.
4. Close the issue once a run publishes again.

## Rolling back to an earlier snapshot

Snapshots are immutable releases, so rolling back means **pointing consumers at an earlier tag**,
never editing data.

1. **Pick the snapshot.** `gh release list` shows the `data-YYYY-MM-DD` releases; each release's notes
   and `manifest.json` show its checks and row counts. Choose the newest one you trust.
2. **Point the API at it.** In Render: **sg-health-api → Environment**, set `DATA_SNAPSHOT` to
   `data-2026-11-01` and save; saving redeploys the API. It downloads and verifies that release and
   refuses to start if any file doesn't match its manifest (Render then keeps the old instance
   running). Then run **Actions → Restart API** with *expect* = `data-2026-11-01` and *restart*
   unticked, to check it. Or by hand: `curl https://<api>/api/v1/meta` shows `snapshot_id` and
   `release_tag`.
3. **Clear the website's cached figures,** or it shows the withdrawn release for up to an hour: in
   Vercel, **Project → Settings → Data Cache → Purge** (the menu may move; it is the "Data Cache"
   setting). The footer's status line then names the release you rolled back to.
4. **Mark the bad snapshot, don't delete it.** Keep it for the record and flag it:
   ```bash
   gh release edit data-2026-11-08 --prerelease \
     --notes "WITHDRAWN: <reason>. Use data-2026-11-01. See issue #<n>."
   ```
   Deleting it would also remove the evidence of what was published. Marking it pre-release is
   also what makes the API's `DATA_SNAPSHOT=latest` skip it.
5. **Fix forward.** Fix the cause, run the weekly workflow by hand, check the new snapshot, then set
   `DATA_SNAPSHOT=latest` again in Render (saving redeploys) and check with **Restart API**
   (*expect* empty, *restart* unticked).

**Retention:** only 12 snapshots are kept (about 3 months). To keep one longer, e.g. for the case
study, copy its assets elsewhere or re-tag it outside the `data-YYYY-MM-DD` pattern (pruning only
matches that pattern):
`gh release download data-2026-11-08 --dir keep && gh release create case-study-2026-11 keep/*`.

**Reproducing a snapshot:** the release files *are* the snapshot. Rebuilding from raw history at the
commit in `manifest.json` gives that code version's output on **today's** raw files, which include
everything fetched since: close, but not byte-identical.

## Deploying

Two services, both on free plans: the **API** on Render (a Docker container built from
`api/Dockerfile`) and the **website** on Vercel. Every setting is listed, with where it is set, in
[`.env.example`](../.env.example). Nothing secret is in the repository.

### First-time setup (by hand, once)

1. **Render**: sign in with GitHub, then **New → Blueprint** and pick this repository. Render reads
   `render.yaml` and creates `sg-health-api` (free plan, Singapore). When it asks for
   `GITHUB_TOKEN`, paste the token from step 2 (or leave it empty and add it later under
   **Environment**).
2. **GitHub token for the API** (raises GitHub's API rate limit; Render's outgoing IPs are shared):
   GitHub → **Settings → Developer settings → Fine-grained tokens → Generate**, *Repository access:
   Public repositories (read-only)*, no extra permissions, expiry 1 year. Put a reminder in your
   calendar for the expiry date.
3. **Deploy hook**: Render → **sg-health-api → Settings → Deploy Hook**, copy the URL. GitHub →
   **Settings → Secrets and variables → Actions → New repository secret**, name exactly
   `RENDER_DEPLOY_HOOK_URL`. Anyone with this URL can redeploy the API, so treat it as a secret.
4. **API address**: on the same GitHub page, **Variables → New repository variable**,
   `API_PUBLIC_URL` = the Render URL, e.g. `https://sg-health-api.onrender.com` (no trailing path).
   The **Keep API awake** workflow (`keep-api-awake.yml`) also uses it: it requests `/api/v1/health`
   every 10 minutes, so the free plan's sleep (after about 15 minutes idle) never makes a visitor wait
   30-60 seconds. Disable it in the Actions tab if the API moves to a paid plan, or if another free
   Render service needs the 750 free hours.
5. **Vercel**: sign in with GitHub, **Add New → Project**, import this repository, set **Root
   Directory** to `web`. Under **Environment Variables** (Production and Preview):
   `API_BASE_URL` = the Render URL, `API_REVALIDATE_SECONDS` = `3600`, `SHOW_DEV_PAGES` = `false`.
   If the Node.js version setting is offered, match `web/.nvmrc`. Deploy.
6. **Check**: `https://<api>/api/v1/meta` shows the newest `data-YYYY-MM-DD`; the website's footer
   names the same release with a link to it. Then run **Actions → Weekly pipeline → Run workflow**
   and confirm the step *Check the API serves the new snapshot* passes.

### Routine deploys

- **Website**: every push to `main` deploys to production; every pull request gets a preview URL
  (previews call the production API, which is read-only). Vercel deploys even if CI fails, so
  check CI before pushing to `main`. To undo a bad deploy: Vercel → **Deployments**, pick the last
  good one → **Promote to Production**.
- **API code**: a push to `main` that changes `api/**` rebuilds and redeploys it on Render; other
  pushes don't. To undo: Render → **sg-health-api → Events**, roll back to the previous deploy.
- **Data**: a new data release restarts the API through the deploy hook (weekly workflow). Nothing
  to do by hand. To restart it any time: **Actions → Restart API**.

### What the free plans mean

- **The API sleeps after about 15 minutes without requests**, and waking takes up to about a
  minute (it re-downloads and verifies the release, about 4 MB). The website reuses each API
  response for an hour and serves the old copy while it fetches a new one, so visitors rarely wait.
  If they do (the page says the data service isn't responding, then works on reload), add a free
  uptime monitor (e.g. UptimeRobot) on `https://<api>/api/v1/health` every 5 minutes: it keeps the
  API awake and emails you when it's down. One always-on service fits Render's free monthly hours.
- **Vercel's Hobby plan is for non-commercial use**, which fits a personal portfolio.
- **Static pages** (e.g. Methodology) show the footer's release from their last build or hourly
  refresh, like every cached figure.

## SingStat population, yearly refresh

SingStat publishes each June edition around **September**. GitHub's runners can't download it (SingStat
returns HTTP 403 to them), so it is refreshed **by hand** and committed. The `freshness.population_15_months`
warning appears once the committed edition is more than 15 months past its reference date.

1. Open SingStat's [geographic distribution page](https://www.singstat.gov.sg/find-data/explore-data-themes/population/geographic-distribution/latest-news-data),
   section **Singapore Residents by Planning Area / Subzone, Age Group, Sex and *Type of Dwelling***.
   **Not** the *Floor Area of Residence* edition: it leaves out about 20,000 residents aged 65+.
2. Download the new June edition **in CSV** (a zip) into `data/reference/singstat/`, e.g.
   `respopagesextod2027.zip`, and delete the old file.
3. Check it parses and looks right:
   ```bash
   python -c "from sg_health.parsers.singstat import parse_residents_zip as p; \
     d = p(open('data/reference/singstat/respopagesextod2027.zip','rb').read()); \
     print(d.planning_area.nunique(), int(d.residents_total.sum()), int(d.residents_65plus.sum()))"
   ```
   Expect 55 planning areas (unless URA changed boundaries) and totals close to last year's.
4. In `pipeline/sg_health/config.py`, update `SINGSTAT_RESIDENTS_FILE`, `SINGSTAT_RESIDENTS_SHA256`
   (`shasum -a 256 <file>`) and `SINGSTAT_RESIDENTS_URL` (the link you downloaded from, for lineage).
5. Update the expected totals in `test_the_committed_reference_file_matches_its_hash_and_parses`
   (`pipeline/tests/test_ingest.py`) and the figures in `docs/data_dictionary.md` (source status).
6. Run `pytest -q pipeline/tests`, then `sg-health reparse && sg-health validate`, and commit
   (`data: SingStat residents June 2027`). The next weekly run publishes it.

If URA changes planning-area boundaries, `completeness.population_present` or the area name map will
stop the build and list the names: add the new boundary file and update `ref_area_name_map` logic
deliberately; nothing is guessed.

## Keys and secrets

Nothing secret is ever committed: the repo is public. `.env` is git-ignored, and a test fails if
`.env.example` holds a value for a key or token. If a secret leaks (pasted in an issue, a log, a
commit), **rotate it first**, then clean up.

| Secret | Where it is set | What it does |
|---|---|---|
| `DATAGOV_API_KEY` | GitHub secret; your local `.env` | Higher data.gov.sg rate limits for the pipeline. Optional |
| `RENDER_DEPLOY_HOOK_URL` | GitHub secret | Lets the weekly workflow restart the API. The URL is the secret |
| `GITHUB_TOKEN` (fine-grained) | Render → Environment | Raises GitHub's API rate limit for the API's release lookup. Public read-only |
| `GITHUB_TOKEN` (Actions) | Provided by GitHub per run | The workflows declare only the permissions they need. Nothing to rotate |

GitHub secrets: **Settings → Secrets and variables → Actions**. Names must match exactly.
Locally, put `DATAGOV_API_KEY=...` in `.env` at the repo root (copy `.env.example`). It's loaded
automatically with python-dotenv, never required, and a real environment variable wins.

### Rotating keys

- **`DATAGOV_API_KEY`**: create a new key on data.gov.sg, update the GitHub secret (and your `.env`),
  then revoke the old key. Check: the next weekly run's *Ingest* step fetches data.gov.sg without
  rate-limit errors (or run it by hand with `--sources opendata`).
- **`RENDER_DEPLOY_HOOK_URL`**: Render → **sg-health-api → Settings → Deploy Hook → Regenerate**
  (the old URL stops working), then update the GitHub secret. Check: **Actions → Restart API**.
- **Render's `GITHUB_TOKEN`**: generate a new fine-grained token (same settings as in
  [first-time setup](#first-time-setup-by-hand-once)), paste it in Render → **Environment** (saving
  redeploys), then delete the old token on GitHub. Do this before it expires: without it the API
  still starts, but may hit GitHub's 60-requests-an-hour limit on Render's shared IPs and fail to
  find the release.

## When a scheduled run fails

GitHub emails you when a workflow fails (check **Settings → Notifications → Actions**). Open the
run, find the first red step, then:

| Failed step | What it means | What to do |
|---|---|---|
| **weekly: Test** | The code is broken; no data was touched | Fix the test failure, push, run the workflow by hand |
| **weekly: Restore data/raw** | `data-latest` exists but didn't download (usually a GitHub hiccup) | Re-run the job. Never delete `data-latest` to "fix" it |
| **weekly: Ingest** | A source failed in a way that stopped the run (one source being down doesn't). Raw history was still archived | Read the `source_summary` log lines; see [When publishing is blocked](#when-publishing-is-blocked) for parser problems |
| **weekly: Validate**, with a `data-quality` issue | Publishing is blocked by a data check | [When publishing is blocked](#when-publishing-is-blocked). The site keeps the last release |
| **weekly: Transform / Publish** | A SQL or packaging error | Reproduce locally (`sg-health reparse && sg-health transform && sg-health publish`), fix, push, re-run |
| **weekly: Check the API serves the new snapshot** | The release is published, but the API didn't switch to it within 20 minutes. It keeps serving the previous one | Render → **sg-health-api → Events / Logs**: the API logs why it refused to start (e.g. a file failed verification). Fix, then **Actions → Restart API**. If the new release itself is bad, [roll back](#rolling-back-to-an-earlier-snapshot) |
| **weekly: Restart the API** | Render didn't accept the deploy hook (wrong or regenerated URL, or Render down) | Check the `RENDER_DEPLOY_HOOK_URL` secret; then **Actions → Restart API** |
| **live** | One NUHS reading was missed | Usually nothing: the next run is 3 hours later. If it keeps failing, NUHS changed its page: see the NUHS parser and its tests |
| *No run at all* | GitHub disabled the schedule after 60 days without repository activity | **Actions → *workflow* → Enable workflow**, then run it by hand |

## Live waits store

`live.yml` keeps every NUHS reading in its own raw store. To work with it locally:

```bash
mkdir -p data-live && gh release download live-latest --pattern live.tar.gz && tar -xzf live.tar.gz -C data-live
SG_HEALTH_DATA_DIR=$PWD/data-live sg-health reparse --no-transform --no-report
```

Or just read `nuhs_live_waits.parquet` from the same release.

## Housekeeping

- **GitHub disables scheduled workflows after 60 days without repository activity** (it emails first).
  Re-enable under *Actions → <workflow> → Enable workflow*, or push any commit.
- **Notifications:** make sure *Settings → Notifications → Actions* emails you about failed workflows.
- **Restore raw history locally:** `gh release download data-latest --pattern raw.tar.gz && mkdir -p data && tar -xzf raw.tar.gz -C data && sg-health reparse`.
