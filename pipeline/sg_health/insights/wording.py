"""Sentences from templates.yml, with the language rules enforced when they are rendered."""
from __future__ import annotations

import re
from functools import cache
from typing import Any

import yaml

from .model import TEMPLATES_FILE

MAX_HEADLINE_WORDS = 20
MAX_DETAIL_SENTENCES = 2
MAX_LABEL_WORDS = 12          # the labels around the key number, chart labels and the callout
DISPLAY_FIELDS = ("metric_label", "comparison_label", "change_word", "callout")   # templates.yml keys
REQUIRED_DISPLAY = ("metric_label", "callout")
# Rule 5 (docs/language_rules.md): never causal words. Word forms included.
CAUSAL = re.compile(r"\b(caus(e|es|ed|ing)|due to|driv(e|es|en|ing)|drove|lead(s|ing)? to|led to|because)\b", re.I)
# Probability language (B1): only a finding with a p-value may use it, and then only as its adjusted odds.
PROBABILITY = re.compile(r"\b(chance|odds|(un)?likely|probab\w*|significan\w*|random\w*|by luck)\b", re.I)
EVIDENCE_LEVELS = ("observed", "tested", "robust", "association-only")


class WordingError(ValueError):
    """A rendered sentence breaks the language rules."""


@cache
def templates() -> dict[str, Any]:
    return yaml.safe_load(TEMPLATES_FILE.read_text())


def hours(v: float) -> str:
    r = round(v, 1)
    return f"{r:.1f} {'hour' if r == 1.0 else 'hours'}"


def percent(v: float) -> str:
    return f"{round(v):d}%"


def count(v: float) -> str:
    return f"{round(v):,d}"


def p_text(p: float) -> str:
    return "< 0.001" if p < 0.001 else f"= {p:.3f}"


def chance_text(p: float) -> str:
    """The adjusted p-value as plain odds, for the sentences: "less than 1 in 1,000", "about 4 in 1,000",
    "about 3 in 100". Readers didn't know what "adjusted p < 0.001" meant (comprehension report)."""
    if p < 0.001:
        return "less than 1 in 1,000"
    if p < 0.01:
        return f"about {max(1, round(p * 1000))} in 1,000"
    return f"about {max(1, round(p * 100))} in 100"


_PLURAL = re.compile(r"\{(\w+)\|([^|{}]+)\|([^|{}]+)\}")


def fill(template: str, values: dict[str, Any]) -> str:
    """{name} -> value; {n|area|areas} -> singular when n is 1, else plural."""
    def plural(m: re.Match[str]) -> str:
        n = values[m.group(1)]
        return m.group(2) if float(n) == 1 else m.group(3)
    text = _PLURAL.sub(plural, template)
    try:
        return text.format(**values)
    except KeyError as exc:
        raise WordingError(f"template value {exc} missing for: {template}") from exc


def sentences(text: str) -> list[str]:
    return [s for s in re.split(r"(?<=[.!?])\s+(?=[A-Z0-9])", text.strip()) if s]


def check(text: str, *, kind: str, forbidden: frozenset[str] = frozenset()) -> None:
    if CAUSAL.search(text):
        raise WordingError(f"causal word in {kind}: {text!r}")
    for col in forbidden:
        if re.search(rf"\b{re.escape(col)}\b", text):
            raise WordingError(f"database column name {col!r} in {kind}: {text!r}")
    if kind == "headline":
        if len(sentences(text)) != 1:
            raise WordingError(f"headline must be one sentence: {text!r}")
        if len(text.split()) > MAX_HEADLINE_WORDS:
            raise WordingError(f"headline over {MAX_HEADLINE_WORDS} words ({len(text.split())}): {text!r}")
    if kind == "detail" and len(sentences(text)) > MAX_DETAIL_SENTENCES:
        raise WordingError(f"detail over {MAX_DETAIL_SENTENCES} sentences: {text!r}")
    if kind == "label":
        if len(text.split()) > MAX_LABEL_WORDS:
            raise WordingError(f"label over {MAX_LABEL_WORDS} words ({len(text.split())}): {text!r}")
        if len(sentences(text)) > 1 or text.endswith("."):
            raise WordingError(f"a label is a phrase, not a sentence: {text!r}")


def check_probability(text: str, *, tested: bool) -> None:
    """Refuse probability words in a finding that has no p-value (B1)."""
    if not tested and PROBABILITY.search(text):
        raise WordingError(f"probability wording without a p-value: {text!r}")


def render(detector: str, variant: str, values: dict[str, Any], forbidden: frozenset[str] = frozenset(),
           evidence: str | None = None) -> tuple[str, str]:
    """Headline and detail. With `evidence`, the detail ends with that level's sentence (templates.yml, evidence)."""
    t = templates()[detector][variant]
    headline = fill(t["headline"], values)
    detail = fill(t["detail"], values)
    if evidence is not None:
        if evidence not in EVIDENCE_LEVELS:
            raise WordingError(f"unknown evidence level {evidence!r}")
        detail = f"{detail} {fill(templates()['evidence'][evidence], values)}"
        for text in (headline, detail):
            check_probability(text, tested=evidence != "observed")
    check(headline, kind="headline", forbidden=forbidden)
    check(detail, kind="detail", forbidden=forbidden)
    return headline, detail


def render_display(detector: str, variant: str, values: dict[str, Any],
                   forbidden: frozenset[str] = frozenset()) -> dict[str, str | None]:
    """The labels around an insight's key number and its chart callout, from templates.yml.

    metric_label: what the key number is. comparison_label: what it is compared with, with the
    comparison's own value ("1.4 hours, usual for this hospital"); the site shows it after "vs".
    change_word: the word beside the arrow ("higher than usual"). callout: the chart's annotation.
    """
    t = templates()[detector][variant]
    out: dict[str, str | None] = {}
    for key in DISPLAY_FIELDS:
        if key not in t:
            if key in REQUIRED_DISPLAY:
                raise WordingError(f"templates.yml {detector}.{variant} has no {key}")
            out[key] = None
            continue
        text = fill(t[key], values)
        check(text, kind="label", forbidden=forbidden)
        out[key] = text
    return out
