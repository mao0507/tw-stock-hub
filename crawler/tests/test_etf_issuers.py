import gzip
from datetime import date
from pathlib import Path

from crawlers.fundamental.etf import assign_stock_ids, pick_source
from crawlers.fundamental.etf_issuers import nuxt_value, parse_yuanta

FIX = Path(__file__).parent / "fixtures"
nuxt = lambda etf: gzip.open(FIX / f"yuanta_nuxt_{etf}.js.gz", "rt", encoding="utf-8").read()  # noqa: E731


def test_nuxt_value_resolves_params_and_literals():
    script = 'window.__NUXT__=(function(a,b,c){return {x:{n:a,list:[b,.5,c],e:Array(2)},y:"z"}}("名",1,void 0));'
    assert nuxt_value(script, "x") == {"n": "名", "list": [1, 0.5, None], "e": [None, None]}
    assert nuxt_value(script, "missing") is None


def test_yuanta_domestic_equity_with_futures():
    data_date, rows = parse_yuanta(nuxt("0056"))
    assert data_date == date(2026, 9, 24)
    assert len(rows) == 51
    assert rows[0] == {"name": "南亞", "stock_id": None, "symbol": "1303", "weight": 7.81, "shares": 261634093}
    assert {"name": "臺股期貨 202610", "stock_id": None, "symbol": "TX", "weight": 1.51, "shares": 1247} in rows


def test_yuanta_foreign_and_bond():
    d, rows = parse_yuanta(nuxt("00646"))
    assert d == date(2026, 9, 23)
    assert len(rows) == 504
    assert rows[0]["symbol"] == "NVDA UQ"
    _, bonds = parse_yuanta(nuxt("00679B"))
    assert bonds[0] == {"name": "US TREASURY N/B 4.75% 05/15/2055", "stock_id": None, "symbol": "912810UK2", "weight": 5.42, "shares": 266350077}


def test_parse_yuanta_without_state():
    assert parse_yuanta("<html></html>") == (None, [])


def test_assign_stock_ids_only_for_known_taiwan_codes():
    rows = [
        {"name": "南亞", "stock_id": None, "symbol": "1303", "weight": 1, "shares": 1},
        {"name": "NVIDIA", "stock_id": None, "symbol": "NVDA UQ", "weight": 1, "shares": 1},
        {"name": "期貨", "stock_id": None, "symbol": "TX", "weight": 1, "shares": 1},
    ]
    assert [r["stock_id"] for r in assign_stock_ids(rows, {"1303", "2330"})] == ["1303", None, None]


def test_pick_source_prefers_issuer_parser():
    assert pick_source("元大")[0] == "yuanta"
    assert pick_source("群益")[0] == "capital"
    assert pick_source("國泰")[0] == "cathay"
    assert pick_source("富邦") is None
    assert pick_source(None) is None


# ── 群益：JSON API（fundId 由 ETF 清單 API 自動對照）
import json  # noqa: E402

from crawlers.fundamental.etf_issuers import capital_fund_ids, parse_capital  # noqa: E402

cap = lambda name: json.loads((FIX / name).read_text(encoding="utf-8"))  # noqa: E731


def test_capital_fund_id_mapping_from_list():
    ids = capital_fund_ids(cap("capital_etf_list.json"))
    assert ids["00919"] == "195"
    assert ids["00937B"] == "378"
    assert len(ids) == 28


def test_capital_stocks_and_futures():
    data_date, rows = parse_capital(cap("capital_buyback_195.json"))
    assert data_date == date(2026, 9, 24)  # pcf.date2：申購買回清單對應的交易日
    assert len(rows) == 41
    assert rows[0] == {"name": "富邦金", "stock_id": None, "symbol": "2881", "weight": 15.029, "shares": 608720000}
    assert {"name": "台指期202610", "stock_id": None, "symbol": "TX202610", "weight": 0.152, "shares": 96} in rows


def test_capital_bond_fund():
    data_date, rows = parse_capital(cap("capital_buyback_378.json"))
    assert data_date == date(2026, 9, 23)
    assert len(rows) == 218
    assert rows[0]["symbol"] == "XS2638076187" and rows[0]["shares"] is None  # 債券為面額，不當股數


def test_capital_without_pcf_uses_list_date():
    payload = cap("capital_buyback_378.json")
    payload["data"]["pcf"] = None
    assert parse_capital(payload)[0] == date(2026, 9, 29)


def test_capital_empty():
    assert parse_capital({"code": 200, "data": None}) == (None, [])


# ── 國泰：cwapi（需瀏覽器標頭）；FundCode 由 ETF 清單對照，SearchDate 往回找到有資料的交易日
from crawlers.fundamental.etf_issuers import cathay_fund_ids, parse_cathay  # noqa: E402


def test_cathay_fund_id_mapping():
    ids = cathay_fund_ids(cap("cathay_etf_list.json"))
    assert ids["00878"] == "CN"
    assert ids["00687B"] == "A8"
    assert len(ids) == 41


def test_cathay_stocks_bonds_futures():
    stocks = parse_cathay(cap("cathay_stock_CN.json"), None, None)
    assert stocks[0] == {"name": "中信金", "stock_id": None, "symbol": "2891", "weight": 9.64, "shares": 922437000}
    bonds = parse_cathay(None, cap("cathay_bond_A8.json"), None)
    assert bonds[0] == {"name": "US TREASURY N/B 5.0-2056/05/15", "stock_id": None, "symbol": "BBG0221YLR40", "weight": 4.8, "shares": None}
    fut = parse_cathay(None, None, cap("cathay_future_82.json"))
    assert fut == [{"name": "SGX FTSE CHINA A50 2026/10", "stock_id": None, "symbol": "SCN", "weight": 197.94, "shares": 8076}]


def test_cathay_no_data():
    assert parse_cathay({"result": None, "returnCode": "4005"}, None, None) == []
