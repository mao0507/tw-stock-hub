from contextlib import asynccontextmanager

import pytest

from crawlers.base.base_crawler import BaseCrawler


@asynccontextmanager
async def fake_session():
    yield object()


@pytest.fixture(autouse=True)
def patch_infra(monkeypatch):
    monkeypatch.setattr("crawlers.base.base_crawler.get_session", fake_session)
    monkeypatch.setattr("crawlers.base.base_crawler.write_crawler_log", _noop)
    monkeypatch.setattr("crawlers.base.base_crawler.asyncio.sleep", _noop)


async def _noop(*args, **kwargs):
    return None


class AlwaysSucceeds(BaseCrawler):
    crawler_name = "always-succeeds"

    async def crawl(self) -> int:
        return 5


class FailsThenSucceeds(BaseCrawler):
    crawler_name = "fails-then-succeeds"

    def __init__(self):
        super().__init__()
        self.attempts = 0

    async def crawl(self) -> int:
        self.attempts += 1
        if self.attempts < 2:
            raise RuntimeError("transient error")
        return 3


class AlwaysFails(BaseCrawler):
    crawler_name = "always-fails"

    async def crawl(self) -> int:
        raise RuntimeError("permanent error")


async def test_run_with_retry_returns_count_on_success():
    crawler = AlwaysSucceeds()
    assert await crawler._run_with_retry() == 5


async def test_run_with_retry_recovers_after_transient_failure():
    crawler = FailsThenSucceeds()
    assert await crawler._run_with_retry() == 3
    assert crawler.attempts == 2


async def test_run_with_retry_raises_after_exhausting_attempts():
    crawler = AlwaysFails()
    with pytest.raises(RuntimeError, match="permanent error"):
        await crawler._run_with_retry()


def _capture_failures(monkeypatch):
    recorded = []

    async def fake(name, error):
        recorded.append((name, error))

    monkeypatch.setattr("crawlers.base.base_crawler.alert_manager.record_failure", fake)
    return recorded


async def test_run_success_does_not_check_alert(monkeypatch):
    recorded = _capture_failures(monkeypatch)
    await AlwaysSucceeds().run()
    assert recorded == []


async def test_run_records_failure_and_reraises(monkeypatch):
    recorded = _capture_failures(monkeypatch)
    crawler = AlwaysFails()
    with pytest.raises(RuntimeError):
        await crawler.run()
    assert recorded[0][0] == "always-fails"


async def test_log_write_failure_keeps_original_error(monkeypatch):
    recorded = _capture_failures(monkeypatch)

    async def broken_log(*args, **kwargs):
        raise ConnectionError("db down")

    monkeypatch.setattr("crawlers.base.base_crawler.write_crawler_log", broken_log)
    with pytest.raises(RuntimeError, match="permanent error"):
        await AlwaysFails().run()
    assert recorded[0][0] == "always-fails"
