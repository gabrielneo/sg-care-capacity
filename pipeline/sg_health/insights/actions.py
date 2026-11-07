"""who_acts and action from docs/insight_actions.yml. The author writes these; code never does.
An entry still marked reviewed: false is skipped (the file's own rule), so the insight is
published without an action."""
from __future__ import annotations

from functools import cache
from typing import Any

import yaml

from .model import ACTIONS_FILE
from .wording import CAUSAL

PENDING = "Suggested action pending the author's review (docs/insight_actions.yml)."


@cache
def _load() -> dict[str, Any]:
    if not ACTIONS_FILE.exists():
        return {}
    return yaml.safe_load(ACTIONS_FILE.read_text()) or {}


def action_for(detector: str, key: str | None, values: dict[str, Any]) -> tuple[str | None, str | None, str | None]:
    """(who_acts, action, note). Both None, with a note, if the entry isn't usable."""
    entry = (_load().get("detectors") or {}).get(detector)
    if not entry:
        return None, None, "No suggested action for this finding."
    if entry.get("reviewed") is not True:
        return None, None, PENDING
    block = entry
    for group in ("by_direction", "by_strength"):
        if group in entry:
            block = entry[group].get(key or "", {})
    who, act = block.get("who_acts"), block.get("action")
    if not who or not act:
        return None, None, "No suggested action for this finding."
    try:
        who, act = " ".join(str(who).format(**values).split()), " ".join(str(act).format(**values).split())
    except KeyError:
        return None, None, "The suggested action needs a value this finding doesn't have."
    if CAUSAL.search(who) or CAUSAL.search(act):
        return None, None, "The suggested action uses a causal word, so it is not shown (docs/language_rules.md)."
    return who, act, None
