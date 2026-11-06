"""Command line: run | backfill | reparse | validate | report."""
from __future__ import annotations

import argparse
import logging
import sys
from datetime import date
from typing import Optional

from .config import DEFAULT_DB, DEFAULT_REPORT, RAW_DIR, SINGSTAT_POP_TABLE_ID
from .http import PoliteHttp
from . import logs
from .load import Loader, reparse
from .quality import validate as dq
from .raw import RawStore
from .report import export_report
from .sources.datagov import ingest_opendata
from .sources.live import ingest_live
from .sources.moh import ingest_moh
from .sources.singstat import ingest_singstat
from .sources.wayback import backfill_moh
from .warehouse import SchemaOutOfDate, Warehouse

LOG = logging.getLogger("sg_health")

ALL_SOURCES = ("moh", "live", "opendata", "singstat")
# Raw sources each step fetches, so each gets a summary line even if nothing arrived.
STEP_SOURCES = {
    "moh": ("moh_bed_waits", "moh_ed_attendances"),
    "live": ("nuhs_live",),
    "opendata": ("datagov_chas",),
    "singstat": ("singstat",),
}


def _run_step(name: str, fn, *args) -> int:
    try:
        return fn(*args)
    except Exception:  # one broken source must not stop the others
        LOG.exception("Step %s failed", name)
        return -1


def _log_validation(results, run_id: str) -> None:
    for r in results:
        if r.status == "fail":
            (LOG.error if r.blocking else LOG.warning)(
                "%s %s: %s (%d rows)", r.check.check_id, r.table, r.details[:200], r.failing_rows,
                extra={"fields": {"event": "dq_fail", "run_id": run_id, "check_id": r.check.check_id,
                                  "table": r.table, "severity": r.check.severity.value,
                                  "blocks_publish": r.check.blocks_publish, "failing_rows": r.failing_rows}})
    blocking = sum(r.blocking for r in results)
    LOG.info("validation %s: %d checks, %d failing, %d blocking publish", run_id, len(results),
             sum(r.status == "fail" for r in results), blocking,
             extra={"fields": {"event": "dq_summary", "run_id": run_id, "blocking": blocking}})


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(prog="sg-health", description="Singapore healthcare capacity ETL pipeline")
    parser.add_argument("--db", default=str(DEFAULT_DB), help="working warehouse (default: %(default)s)")
    parser.add_argument("--report", default=str(DEFAULT_REPORT), help="Excel report (default: %(default)s)")
    parser.add_argument("--raw-dir", default=str(RAW_DIR), help="raw landing zone (default: %(default)s)")
    parser.add_argument("-v", "--verbose", action="store_true")
    sub = parser.add_subparsers(dest="command", required=True)

    run = sub.add_parser("run", help="scrape sources, load DuckDB, write the Excel report")
    run.add_argument("--sources", default=",".join(ALL_SOURCES),
                     help=f"comma-separated subset of {ALL_SOURCES}")
    run.add_argument("--force", action="store_true", help="re-parse MOH files even if the sha256 was seen")
    run.add_argument("--singstat-table", default=SINGSTAT_POP_TABLE_ID)
    run.add_argument("--no-report", action="store_true")

    bf = sub.add_parser("backfill", help="load historical MOH files from the Wayback Machine")
    bf.add_argument("--start", default="2023-01-01")
    bf.add_argument("--end", default=date.today().isoformat())
    bf.add_argument("--max-snapshots", type=int, default=60, help="per metric, newest first")
    bf.add_argument("--force", action="store_true")

    rp = sub.add_parser("reparse", help="rebuild every parsed table from data/raw alone (no network)")
    rp.add_argument("--no-report", action="store_true")

    sub.add_parser("validate", help="run every data-quality check; exit 1 if any check blocks publishing")

    sub.add_parser("report", help="rebuild the Excel report from the warehouse only")

    args = parser.parse_args(argv)
    logs.configure(verbose=args.verbose)

    try:
        wh = Warehouse(args.db, check_schema=args.command != "reparse")
    except SchemaOutOfDate as exc:
        LOG.error("%s", exc, extra={"fields": {"event": "schema_out_of_date"}})
        return 2
    store = RawStore(args.raw_dir)
    results: dict[str, int] = {}
    failed_records = 0
    loader = None
    try:
        if args.command == "validate":
            checks = dq.run_validation(wh)
            run_id = dq.record(wh, checks)
            print(dq.summary_table(checks, run_id))
            _log_validation(checks, run_id)
            return 1 if any(r.blocking for r in checks) else 0
        if args.command == "reparse":
            results, failed_records = reparse(wh, store)
            if not args.no_report:
                export_report(wh, args.report)
            return 1 if failed_records else 0
        if args.command in ("run", "backfill"):
            http = PoliteHttp()       # only commands that fetch get an HTTP client
            loader = Loader.for_run(wh, store, force=getattr(args, "force", False))
        if args.command == "run":
            wanted = {s.strip() for s in args.sources.split(",") if s.strip()}
            unknown = wanted - set(ALL_SOURCES)
            if unknown:
                parser.error(f"unknown sources: {sorted(unknown)}")
            for step in wanted:
                loader.expect(*STEP_SOURCES[step])
            if "moh" in wanted:
                results["moh"] = _run_step("moh", ingest_moh, http, loader)
            if "live" in wanted:
                results["live"] = _run_step("live", ingest_live, http, loader)
            if "opendata" in wanted:
                results["opendata"] = _run_step("opendata", ingest_opendata, http, loader)
            if "singstat" in wanted:
                results["singstat"] = _run_step("singstat", ingest_singstat, http, loader, args.singstat_table)
            if not args.no_report:
                export_report(wh, args.report)
            # Record data quality for this run. The exit code is left to `sg-health validate`,
            # which CI runs as the publish gate.
            checks = dq.run_validation(wh)
            _log_validation(checks, dq.record(wh, checks))
        elif args.command == "backfill":
            loader.expect(*STEP_SOURCES["moh"])
            results["backfill"] = _run_step("backfill", backfill_moh, http, loader, args.start, args.end,
                                            args.max_snapshots)
            export_report(wh, args.report)
        else:
            export_report(wh, args.report)
    finally:
        if args.command != "reparse":
            wh.sync_manifest(store.iter_records())
        if loader is not None:
            loader.log_summary(args.command)
        wh.close()
        LOG.info("Summary (rows upserted, -1 = failed): %s", results,
                 extra={"fields": {"event": "command_done", "command": args.command, "results": results}})

    # Exit with 1 only if every step failed, so partial data still gets published in CI.
    return 1 if results and all(v < 0 for v in results.values()) else 0


if __name__ == "__main__":
    sys.exit(main())
