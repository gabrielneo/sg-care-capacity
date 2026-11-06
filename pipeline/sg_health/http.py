"""Polite HTTP client: retries, rate limiting, timeouts and robots.txt."""
from __future__ import annotations

import logging
import random
import time
from typing import Any, Optional
from urllib import robotparser
from urllib.parse import urlparse

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from .config import POLITE_DELAY, REQUEST_TIMEOUT, USER_AGENT

LOG = logging.getLogger(__name__)


class PoliteHttp:
    """requests.Session wrapper with retries, rate limiting, timeouts and robots.txt.

    - Retries 429/5xx with exponential backoff and honours Retry-After.
    - Sleeps a random 1.5-3 s between requests (configurable per call).
    - Checks robots.txt for HTML pages. Official APIs skip the check.
    - Never raises on network errors. It logs them and returns None, so a
      single failing source never kills the whole pipeline.
    """

    def __init__(self, user_agent: str = USER_AGENT, delay: tuple[float, float] = POLITE_DELAY,
                 timeout: int = REQUEST_TIMEOUT) -> None:
        self.delay = delay
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": user_agent,
            "Accept-Language": "en-SG,en;q=0.9",
        })
        retry = Retry(
            total=4, connect=3, read=3, status=4,
            backoff_factor=2,                       # 2s, 4s, 8s, 16s
            status_forcelist=(429, 500, 502, 503, 504),
            allowed_methods=frozenset({"GET", "HEAD"}),
            respect_retry_after_header=True,
            raise_on_status=False,
        )
        adapter = HTTPAdapter(max_retries=retry)
        self.session.mount("https://", adapter)
        self.session.mount("http://", adapter)
        self._last_request = 0.0
        self._robots: dict[str, Optional[robotparser.RobotFileParser]] = {}

    # -- etiquette ---------------------------------------------------------- #
    def _sleep_politely(self, delay: Optional[tuple[float, float]]) -> None:
        lo, hi = delay or self.delay
        wait = random.uniform(lo, hi) - (time.monotonic() - self._last_request)
        if self._last_request and wait > 0:
            time.sleep(wait)

    def allowed(self, url: str) -> bool:
        """Return False only if robots.txt explicitly disallows our user agent."""
        parts = urlparse(url)
        host = f"{parts.scheme}://{parts.netloc}"
        if host not in self._robots:
            rp: Optional[robotparser.RobotFileParser] = robotparser.RobotFileParser()
            try:
                r = self.session.get(f"{host}/robots.txt", timeout=self.timeout)
                if r.status_code == 200:
                    rp.parse(r.text.splitlines())
                else:
                    rp = None  # no robots.txt means everything is allowed
            except requests.RequestException:
                rp = None
            self._robots[host] = rp
        rp = self._robots[host]
        ok = True if rp is None else rp.can_fetch(self.session.headers["User-Agent"], url)
        if not ok:
            LOG.warning("robots.txt disallows %s, skipping", url)
        return ok

    # -- requests ----------------------------------------------------------- #
    def get(self, url: str, *, params: Optional[dict] = None, headers: Optional[dict] = None,
            delay: Optional[tuple[float, float]] = None, check_robots: bool = True
            ) -> Optional[requests.Response]:
        if check_robots and not self.allowed(url):
            return None
        self._sleep_politely(delay)
        try:
            resp = self.session.get(url, params=params, headers=headers, timeout=self.timeout)
        except requests.RequestException as exc:
            LOG.warning("GET %s failed: %s", url, exc)
            return None
        finally:
            self._last_request = time.monotonic()
        if resp.status_code >= 400:
            LOG.warning("GET %s -> HTTP %s", url, resp.status_code)
            return None
        if resp.history and resp.url != url:
            # Not an error by itself, but a page that moved may now serve something else
            # entirely (e.g. a retired page redirecting to a homepage). Lineage records resp.url.
            LOG.warning("GET %s redirected to %s", url, resp.url,
                        extra={"fields": {"event": "redirected", "requested": url, "final": resp.url}})
        return resp

    def get_text(self, url: str, **kw) -> Optional[str]:
        r = self.get(url, **kw)
        return r.text if r is not None else None

    def get_bytes(self, url: str, **kw) -> Optional[bytes]:
        r = self.get(url, **kw)
        return r.content if r is not None else None

    def get_json(self, url: str, **kw) -> Optional[Any]:
        r = self.get(url, **kw)
        if r is None:
            return None
        try:
            return r.json()
        except ValueError:
            LOG.warning("Non-JSON response from %s", url)
            return None


def render_with_playwright(url: str, wait_ms: int = 4000) -> Optional[str]:
    """Fallback for JavaScript-rendered pages. Returns the HTML, or None if Playwright isn't installed.

    Setup: pip install playwright && python -m playwright install chromium
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        LOG.info("Playwright not installed, skipping JS render for %s", url)
        return None
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(user_agent=USER_AGENT)
            page.goto(url, timeout=30_000, wait_until="domcontentloaded")
            page.wait_for_timeout(wait_ms)
            html = page.content()
            browser.close()
            return html
    except Exception as exc:  # browser errors vary widely by platform
        LOG.warning("Playwright render failed for %s: %s", url, exc)
        return None
