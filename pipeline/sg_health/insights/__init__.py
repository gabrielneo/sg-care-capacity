"""Insight engine: deterministic findings from the marts (docs/insights_method.md)."""
from .engine import InsightRun, run, run_in_warehouse, to_json

__all__ = ["InsightRun", "run", "run_in_warehouse", "to_json"]
