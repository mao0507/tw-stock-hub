from datetime import datetime, timezone

from crawlers.news.cnyes import parse_cnyes
from crawlers.news.yahoo import parse_yahoo_entry, yahoo_symbol


def test_cnyes_json_item():
    raw = {
        "newsId": 6614874,
        "title": " 外資回頭掃貨 ",
        "summary": "",
        "content": "&lt;p&gt;台股指數<b>收黑</b>，外資買超&lt;/p&gt;",
        "publishAt": 1790396856,
        "stock": ["2330", "00981A"],
    }
    item = parse_cnyes(raw)
    assert item == {
        "title": "外資回頭掃貨",
        "url": "https://news.cnyes.com/news/id/6614874",
        "published_at": datetime.fromtimestamp(1790396856, tz=timezone.utc),
        "summary": "台股指數收黑，外資買超",
        "stock_ids": ["2330", "00981A"],
    }


def test_cnyes_item_without_title_is_skipped():
    assert parse_cnyes({"newsId": 1, "title": "", "publishAt": 0}) is None


def test_yahoo_symbol_by_market():
    assert yahoo_symbol("2330", "TWSE") == "2330.TW"
    assert yahoo_symbol("6488", "TPEX") == "6488.TWO"


def test_yahoo_rss_entry_uses_pubdate_and_stock():
    entry = {
        "title": "華為新晶片直逼台積電",
        "link": "https://tw.stock.yahoo.com/news/abc",
        "published": "Sat, 26 Sep 2026 08:35:30 GMT",
        "summary": "伯恩斯坦最新報告指出……",
    }
    item = parse_yahoo_entry(entry, "2330")
    assert item["published_at"] == datetime(2026, 9, 26, 8, 35, 30, tzinfo=timezone.utc)
    assert item["stock_ids"] == ["2330"]
    assert item["url"] == "https://tw.stock.yahoo.com/news/abc"


def test_yahoo_entry_without_link_is_skipped():
    assert parse_yahoo_entry({"title": "x"}, "2330") is None
