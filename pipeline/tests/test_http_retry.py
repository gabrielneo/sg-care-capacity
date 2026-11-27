"""R6: a long Retry-After must not stall the weekly job past its timeout (the raw archive step would never run)."""
from urllib3.response import HTTPResponse

from sg_health.http import MAX_RETRY_AFTER, PoliteHttp


def retry_of(http: PoliteHttp):
    return http.session.get_adapter("https://example.org").max_retries


def test_retry_after_is_honoured_but_capped():
    retry = retry_of(PoliteHttp())
    assert retry.get_retry_after(HTTPResponse(headers={"Retry-After": "86400"}, status=429)) == MAX_RETRY_AFTER
    assert retry.get_retry_after(HTTPResponse(headers={"Retry-After": "5"}, status=503)) == 5
    assert retry.get_retry_after(HTTPResponse(status=503)) is None
    assert MAX_RETRY_AFTER <= 60


def test_the_cap_survives_each_retry():
    retry = retry_of(PoliteHttp()).increment(method="GET", url="/", response=HTTPResponse(status=429))
    assert retry.get_retry_after(HTTPResponse(headers={"Retry-After": "3600"}, status=429)) == MAX_RETRY_AFTER


# R16: robots.txt that can't be read because the server fails means "disallow" (RFC 9309, 2.3.1.4); a 4xx means none.
class _Resp:
    def __init__(self, status, text=""):
        self.status_code, self.text = status, text


def _http_with_robots(monkeypatch, answer):
    http = PoliteHttp()
    monkeypatch.setattr(http.session, "get", lambda url, **kw: answer() if callable(answer) else answer)
    return http


def test_robots_txt_server_error_means_disallow(monkeypatch):
    assert not _http_with_robots(monkeypatch, _Resp(503)).allowed("https://www.moh.gov.sg/files/a.xlsx")


def test_robots_txt_unreachable_means_disallow(monkeypatch):
    import requests

    def boom():
        raise requests.ConnectionError("down")
    assert not _http_with_robots(monkeypatch, boom).allowed("https://www.moh.gov.sg/files/a.xlsx")


def test_robots_txt_missing_means_allow_and_rules_are_read(monkeypatch):
    assert _http_with_robots(monkeypatch, _Resp(404)).allowed("https://www.moh.gov.sg/files/a.xlsx")
    rules = _Resp(200, "User-agent: *\nDisallow: /private/\n")
    http = _http_with_robots(monkeypatch, rules)
    assert http.allowed("https://x.example/files/a.xlsx") and not http.allowed("https://x.example/private/b")
