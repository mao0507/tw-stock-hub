from crawlers.quote.broker import decode_bsr_csv, normalize_captcha, parse_bsr_rows
from scheduler.jobs import resolve_job, resolve_param_job

CSV = (
    "券商買賣證券成交價量資訊\r\n"
    '股票代碼,="2330"\r\n'
    "序,券商,價格,買進股數,賣出股數,,序,券商,價格,買進股數,賣出股數\r\n"
    '"1","1020合庫","2470.00","3000","0",,"2","1020合庫","2475.00","12050","0"\r\n'
)


def test_decodes_utf8_with_bom():
    text = decode_bsr_csv(("﻿" + CSV).encode("utf-8"))
    assert parse_bsr_rows(text) == {
        ("1020合庫", 2470.0): {"buy": 3000, "sell": 0},
        ("1020合庫", 2475.0): {"buy": 12050, "sell": 0},
    }


def test_falls_back_to_big5():
    assert "合庫" in decode_bsr_csv(CSV.encode("big5"))


def test_captcha_is_uppercased_and_length_checked():
    assert normalize_captcha("uyzQc") == "UYZQC"
    assert normalize_captcha("Qy3E") is None
    assert normalize_captcha("") is None


def test_param_job_for_on_demand_broker():
    assert resolve_param_job("broker:2454") == ("broker", "2454")
    assert resolve_param_job("broker:../x") is None
    assert resolve_param_job("nope:2454") is None
    assert resolve_param_job("twse_daily") is None
    assert resolve_job("twse_daily") == "twse_daily"
