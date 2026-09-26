from datetime import date

from crawlers.fundamental.exdividend import parse_tpex_prepost, parse_twse_twt48u


def test_twse_twt48u():
    rows = [
        {"Date": "1150916", "Code": "2330", "Name": "台積電", "CashDividend": "7.00000000", "StockDividendRatio": ""},
        {"Date": "", "Code": "2317", "Name": "鴻海"},  # 無日期略過
    ]
    assert parse_twse_twt48u(rows) == [{
        "ex_date": date(2026, 9, 16), "stock_id": "2330", "stock_name": "台積電",
        "cash_dividend": 7.0, "stock_dividend_ratio": None,
    }]


def test_tpex_prepost_keeps_etf_codes_with_letters():
    rows = [{
        "ExRrightsExDividendDate": "1150915", "SecuritiesCompanyCode": "00942B",
        "CompanyName": "台新美A公司債20+", "ExRrightsExDividend": "除息",
        "StockDividendRatio": "0.00000000", "CashDividend": "0.06200000",
    }]
    assert parse_tpex_prepost(rows) == [{
        "ex_date": date(2026, 9, 15), "stock_id": "00942B", "stock_name": "台新美A公司債20+",
        "cash_dividend": 0.062, "stock_dividend_ratio": 0.0,
    }]
