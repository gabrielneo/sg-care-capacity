"""Command line: run | backfill | report."""
from __future__ import annotations

import argparse
import logging
import sys
from datetime import date
from typing import Optional

from .config import SINGSTAT_POP_TABLE_ID
from .http import PoliteHttp
from .report import export_report
from .sources.datagov import ingest_opendata
from .sources.live import ingest_live
from .sources.moh import ingest_moh
from .sources.singstat import ingest_singstat
from .sources.wayback import backfill_moh
from .warehouse import Warehouse

LOG = logging.getLogger("sg_health")

ALL_SOURCES = ("moh", "live", "opendata", "singstat")


def _run_step(name: str, fn, *args) -> int:
    try:
        return fn(*args)
    except Exception:  # one broken source must not stop the others
        LOG.exception("Step %s failed", name)
        return -1


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(prog="sg-health", description="Singapore healthcare capacity ETL pipeline")
    parser.add_argument("--db", default="singapore_healthcare.duckdb")
    parser.add_argument("--report", default="SG_Healthcare_Scrape_Report.xlsx")
    parser.add_argument("-v", "--verbose", action="store_true")
    sub = parser.add_subparsers(dest="command", required=True)

    run = sub.add_parser("run", help="scrape sources, load DuckDB, write the Excel report")
    run.add_argument("--sources", default=",".join(ALL_SOURCES),
                     help=f"comma-separated subset of {ALL_SOURCES}")
    run.add_argument("--force", action="store_true", help="re-parse files even if the hash was seen")
    run.add_argument("--singstat-table", default=SINGSTAT_POP_TABLE_ID)
    run.add_argument("--no-report", action="store_true")

    bf = sub.add_parser("backfill", help="load historical MOH files from the Wayback Machine")
    bf.add_argument("--start", default="2023-01-01")
    bf.add_argument("--end", default=date.today().isoformat())
    bf.add_argument("--max-snapshots", type=int, default=60, help="per metric, newest first")
    bf.add_argument("--force", action="store_true")

    sub.add_parser("report", help="rebuild the Excel report from the warehouse only")

    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO,
                        format="%(asctime)s %(levelname)-7s %(message)s", datefmt="%H:%M:%S")

    wh = Warehouse(args.db)
    http = PoliteHttp()
    results: dict[str, int] = {}
    try:
        if args.command == "run":
            wanted = {s.strip() for s in args.sources.split(",") if s.strip()}
            unknown = wanted - set(ALL_SOURCES)
            if unknown:
                parser.error(f"unknown sources: {sorted(unknown)}")
            if "moh" in wanted:
                results["moh"] = _run_step("moh", ingest_moh, http, wh, args.force)
            if "live" in wanted:
                results["live"] = _run_step("live", ingest_live, http, wh)
            if "opendata" in wanted:
                results["opendata"] = _run_step("opendata", ingest_opendata, http, wh)
            if "singstat" in wanted:
                results["singstat"] = _run_step("singstat", ingest_singstat, http, wh, args.singstat_table)
            if not args.no_report:
                export_report(wh, args.report)
        elif args.command == "backfill":
            results["backfill"] = _run_step("backfill", backfill_moh, http, wh, args.start, args.end,
                                            args.max_snapshots, args.force)
            export_report(wh, args.report)
        else:
            export_report(wh, args.report)
    finally:
        wh.close()

    LOG.info("Summary (rows upserted, -1 = failed): %s", results)
    # Exit with 1 only if every step failed, so partial data still gets committed in CI.
    return 1 if results and all(v < 0 for v in results.values()) else 0


if __name__ == "__main__":
    sys.exit(main())
