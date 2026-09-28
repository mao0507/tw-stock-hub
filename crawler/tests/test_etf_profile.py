from datetime import date
from pathlib import Path

from crawlers.fundamental.etf import parse_profile
from crawlers.fundamental.etf_types import tracking_index_of

FIX = Path(__file__).parent / "fixtures"
html = lambda etf: (FIX / f"moneydj_info_{etf}.html").read_text(encoding="utf-8")  # noqa: E731


def test_parse_profile_domestic_equity():
    assert parse_profile(html("0056")) == {
        "inception_date": date(2007, 12, 13),
        "listing_date": date(2007, 12, 26),
        "aum_million": 797788.3,
        "aum_date": date(2026, 9, 24),
        "currency": "台幣",
        "holdings_count": 50,
        "asset_class": "股票型",
        "region": "台灣",
        "dividend_frequency": "季配",
        "management_fee": 0.4,
        "total_expense": 0.57,
        "custodian": "中國信託商業銀行",
        "tracking_index": "臺灣高股息報酬指數",
        "website": "https://www.yuantaetfs.com/product/detail/0056/Basic_information",
    }


def test_parse_profile_bond_and_foreign():
    bond = parse_profile(html("00679B"))
    assert bond["asset_class"] == "債券型"
    assert bond["dividend_frequency"] == "季配"
    assert bond["total_expense"] == 0.14
    assert bond["tracking_index"] == "ICE美國政府20+年期債券指數"
    assert parse_profile(html("00646"))["region"] == "美國"


def test_parse_profile_empty_page():
    assert parse_profile("<html><body>查無資料</body></html>") is None


def test_tracking_index_from_twse_row():
    assert tracking_index_of({"標的指數/追蹤指數名稱": "臺灣50指數"}) == "臺灣50指數"
    # 主動式 ETF 沒有追蹤指數
    assert tracking_index_of({"標的指數/追蹤指數名稱": "不適用"}) is None
    assert tracking_index_of({}) is None
