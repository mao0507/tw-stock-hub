from contextlib import asynccontextmanager
from dataclasses import dataclass

import pytest

from crawlers.news.deduplicator import NewsDeduplicator


@dataclass
class FakeItem:
    url: str


@asynccontextmanager
async def fake_session():
    yield object()


@pytest.fixture(autouse=True)
def patch_session(monkeypatch):
    monkeypatch.setattr("crawlers.news.deduplicator.get_session", fake_session)


async def test_filter_new_returns_empty_for_empty_input():
    dedup = NewsDeduplicator()
    assert await dedup.filter_new([]) == []


async def test_filter_new_excludes_existing_urls(monkeypatch):
    monkeypatch.setattr(
        "crawlers.news.deduplicator.get_existing_urls",
        lambda session, urls: _resolved({"https://a.com/1"}),
    )
    items = [FakeItem("https://a.com/1"), FakeItem("https://a.com/2")]

    dedup = NewsDeduplicator()
    result = await dedup.filter_new(items)
    assert [i.url for i in result] == ["https://a.com/2"]


async def test_is_new_url_true_when_not_existing(monkeypatch):
    monkeypatch.setattr(
        "crawlers.news.deduplicator.get_existing_urls",
        lambda session, urls: _resolved(set()),
    )
    dedup = NewsDeduplicator()
    assert await dedup.is_new_url("https://a.com/3") is True


async def test_is_new_url_false_when_existing(monkeypatch):
    monkeypatch.setattr(
        "crawlers.news.deduplicator.get_existing_urls",
        lambda session, urls: _resolved({"https://a.com/3"}),
    )
    dedup = NewsDeduplicator()
    assert await dedup.is_new_url("https://a.com/3") is False


async def _resolved(value):
    return value
