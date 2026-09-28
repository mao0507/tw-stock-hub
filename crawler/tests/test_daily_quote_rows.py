from datetime import date

from crawlers.quote.twse_daily import TWSEDailyQuoteCrawler

# TWSE MI_INDEX 個股列：代號、名稱、成交股數、筆數、金額、開、高、低、收、漲跌符號、漲跌…
def row(code: str, name: str) -> list:
    return [code, name, "1,000", "10", "30,000", "30", "31", "29", "30.5", "<p style= color:red>+</p>", "0.5", "", "", "", "", ""]


def test_keeps_stocks_and_letter_suffixed_etfs():
    c = TWSEDailyQuoteCrawler()
    d = date(2026, 9, 24)
    # 「凱基金」名稱含「基金」、「元大台灣50正2」這類 ETF 都要收
    for code, name in [("2883", "凱基金"), ("00631L", "元大台灣50正2"), ("00679B", "元大美債20年"), ("2330", "台積電")]:
        r = c._parse_row(row(code, name), d)
        assert r is not None and r["stock_id"] == code, code


def test_skips_totals_and_non_tradable_codes():
    c = TWSEDailyQuoteCrawler()
    d = date(2026, 9, 24)
    assert c._parse_row(row("2881A", "富邦特"), d) is None  # 特別股
    assert c._parse_row(row("合計", "合計"), d) is None
