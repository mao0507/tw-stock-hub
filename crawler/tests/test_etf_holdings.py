from datetime import date
from pathlib import Path

from crawlers.fundamental.etf import parse_holdings, plan_records

FIX = Path(__file__).parent / "fixtures"
html = lambda etf: (FIX / f"moneydj_holdings_{etf}.html").read_text(encoding="utf-8")  # noqa: E731


def test_domestic_equity_holdings_with_codes():
    data_date, rows = parse_holdings(html("0056"))
    assert data_date == date(2026, 9, 24)
    assert len(rows) == 51
    assert rows[0] == {"name": "南亞", "stock_id": "1303", "symbol": "1303.TW", "weight": 7.81, "shares": 261634093}
    # 台指期貨避險部位：保留原始代號，不算台股
    futures = [r for r in rows if not r["stock_id"]]
    assert futures == [{"name": "臺股期貨 202610", "stock_id": None, "symbol": "FITXN*1.TF", "weight": 1.51, "shares": 1247}]


def test_foreign_holdings_keep_symbol_without_stock_id():
    data_date, rows = parse_holdings(html("00646"))
    assert data_date == date(2026, 9, 23)
    assert rows[0] == {"name": "NVIDIA", "stock_id": None, "symbol": "NVDA.US", "weight": 8.09, "shares": 559344}
    assert len(rows) == 504


def test_bond_holdings_have_no_code_or_shares():
    _, rows = parse_holdings(html("00679B"))
    assert rows[0] == {"name": "US TREASURY N/B 4.75% 05/15/2055", "stock_id": None, "symbol": None, "weight": 5.42, "shares": None}


def test_no_table_returns_empty():
    assert parse_holdings("<html><body>查無資料</body></html>") == (None, [])


def test_plan_records_only_when_data_date_is_new():
    rows = [
        {"name": "台積電", "stock_id": "2330", "symbol": "2330.TW", "weight": 50.0, "shares": 10},
        {"name": "台積電", "stock_id": "2330", "symbol": "2330.TW", "weight": 1.0, "shares": 1},  # 重複名稱：合併
    ]
    recs = plan_records("0050", date(2026, 9, 24), rows, latest=date(2026, 9, 23), source="moneydj")
    assert recs == [{
        "etf_id": "0050", "data_date": date(2026, 9, 24), "holding_name": "台積電", "stock_id": "2330",
        "symbol": "2330.TW", "weight": 51.0, "shares": 11, "source": "moneydj",
    }]
    assert plan_records("0050", date(2026, 9, 24), rows, latest=date(2026, 9, 24), source="moneydj") == []
    assert plan_records("0050", None, rows, latest=None, source="moneydj") == []
