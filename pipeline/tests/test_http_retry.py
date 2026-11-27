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
