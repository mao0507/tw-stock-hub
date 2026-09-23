from contextlib import asynccontextmanager

import pytest

from crawlers.news.stock_mention_extractor import StockMentionExtractor


@asynccontextmanager
async def fake_session():
    yield object()


@pytest.fixture
def extractor(monkeypatch):
    monkeypatch.setattr("crawlers.news.stock_mention_extractor.get_session", fake_session)
    monkeypatch.setattr(
        "crawlers.news.stock_mention_extractor.get_all_stock_map",
        lambda session: _resolved({"2330": "台積電股份有限公司", "2317": "鴻海"}),
    )
    return StockMentionExtractor()


async def _resolved(value):
    return value


def test_shorten_name_strips_suffixes(extractor):
    assert extractor._shorten_name("台積電股份有限公司") == "台積電"
    assert extractor._shorten_name("鴻海") == "鴻海"


async def test_extract_finds_stock_id_in_text(extractor):
    result = await extractor.extract("今日 2330 大漲")
    assert "2330" in result


async def test_extract_finds_stock_name_in_text(extractor):
    result = await extractor.extract("台積電股份有限公司今日大漲")
    assert "2330" in result


async def test_extract_finds_shortened_name(extractor):
    result = await extractor.extract("台積電今日大漲")
    assert "2330" in result


async def test_extract_returns_empty_for_no_match(extractor):
    result = await extractor.extract("無關文字")
    assert result == []


async def test_extract_returns_empty_for_empty_text(extractor):
    result = await extractor.extract("")
    assert result == []
