from datetime import date

from crawlers.fundamental.valuation import parse_tpex, parse_twse

D = date(2023, 9, 1)


def test_twse_maps_fields_by_name():
    payload = {
        "stat": "OK",
        "fields": ["證券代號", "證券名稱", "收盤價", "殖利率(%)", "股利年度", "本益比", "股價淨值比", "財報年/季"],
        "data": [["1101", "台泥", "35.25", "1.42", 111, "28.89", "1.21", "112/2"]],
    }
    assert parse_twse(payload, D) == [
        {"date": D, "stock_id": "1101", "pe": 28.89, "pb": 1.21, "dividend_yield": 1.42},
    ]


def test_twse_older_layout_without_close_column():
    # 早年欄位順序不同（無收盤價），必須依欄名取值而非位置
    payload = {
        "stat": "OK",
        "fields": ["證券代號", "證券名稱", "本益比", "殖利率(%)", "股價淨值比"],
        "data": [["2330", "台積電", "15.20", "3.10", "4.05"]],
    }
    [r] = parse_twse(payload, D)
    assert (r["pe"], r["dividend_yield"], r["pb"]) == (15.2, 3.1, 4.05)


def test_twse_loss_company_pe_is_none_and_non_numeric_codes_skipped():
    payload = {
        "stat": "OK",
        "fields": ["證券代號", "證券名稱", "殖利率(%)", "本益比", "股價淨值比"],
        "data": [["2888", "新光金", "0.00", "-", "0.75"], ["合計", "", "", "", ""]],
    }
    [r] = parse_twse(payload, D)
    assert r["stock_id"] == "2888"
    assert r["pe"] is None
    assert r["dividend_yield"] == 0.0


def test_twse_holiday_returns_empty():
    assert parse_twse({"stat": "很抱歉，沒有符合條件的資料!"}, D) == []


def test_tpex_maps_fields_and_strips_padded_names():
    payload = {"tables": [{
        "date": "112/09/01",
        "fields": ["股票代號", "公司名稱", "本益比", "每股股利", "股利年度", "殖利率(%)", "股價淨值比"],
        "data": [["1240", "茂生農經        ", "74.03", "1.20000000", 111, "2.61", "1.43"]],
    }]}
    assert parse_tpex(payload, D) == [
        {"date": D, "stock_id": "1240", "pe": 74.03, "pb": 1.43, "dividend_yield": 2.61},
    ]


def test_tpex_empty_tables_returns_empty():
    assert parse_tpex({"tables": []}, D) == []
    assert parse_tpex({"tables": [{"fields": [], "data": []}]}, D) == []
