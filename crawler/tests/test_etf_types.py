from crawlers.fundamental.etf_types import classify, issuer_of, resolve_types

# 取自 TWSE OpenAPI t187ap47_L（基金基本資料）實際回應，只留用到的欄位
ROWS = [
    {"基金代號": "0050", "基金類型": "國內成分證券指數股票型基金", "基金中文名稱": "元大台灣卓越50證券投資信託基金"},
    {"基金代號": "00405A", "基金類型": "國內成分證券主動式交易所交易基金(股票)", "基金中文名稱": "富邦台灣龍耀主動式ETF證券投資信託基金"},
    {"基金代號": "00646", "基金類型": "國外成分證券指數股票型基金", "基金中文名稱": "元大標普500證券投資信託基金"},
    {"基金代號": "00710B", "基金類型": "國外成分證券指數股票型基金", "基金中文名稱": "復華彭博非投資等級債券ETF證券投資信託基金"},
    {"基金代號": "00631L", "基金類型": "槓桿/反向指數股票型基金", "基金中文名稱": "元大台灣50單日正向2倍證券投資信託基金"},
    {"基金代號": "00632R", "基金類型": "槓桿/反向指數股票型基金", "基金中文名稱": "元大台灣50單日反向1倍證券投資信託基金"},
    {"基金代號": "00635U", "基金類型": "指數股票型期貨信託基金", "基金中文名稱": "元大期貨S&P黃金ER指數股票型期貨信託基金"},
    {"基金代號": "0061", "基金類型": "連結式證券指數股票型基金", "基金中文名稱": "元大寶來滬深300證券投資信託基金"},
    {"基金代號": "00878", "基金類型": "國內成分證券指數股票型基金", "基金中文名稱": "國泰台灣ESG永續高股息ETF證券投資信託基金"},
]


def test_classify_by_fund_type_and_suffix():
    got = {r["基金代號"]: classify(r["基金代號"], r["基金類型"]) for r in ROWS}
    assert got == {
        "0050": "etf_equity",
        "00405A": "etf_equity",
        "00646": "etf_foreign",
        "00710B": "etf_bond",  # 類型寫國外成分，但 B 結尾是債券
        "00631L": "etf_leveraged",
        "00632R": "etf_leveraged",
        "00635U": "etf_other",  # 期貨信託
        "0061": "etf_foreign",  # 連結式（投資海外 ETF）
        "00878": "etf_equity",
    }


def test_classify_without_official_row_uses_suffix():
    # 上櫃 ETF 不在 t187ap47_L：依代號後綴
    assert classify("00937B", None) == "etf_bond"
    assert classify("00680L", None) == "etf_leveraged"
    assert classify("00900", None) == "etf_other"


def test_issuer_from_fund_name():
    assert issuer_of("元大台灣卓越50證券投資信託基金") == "元大"
    assert issuer_of("富邦台灣龍耀主動式ETF證券投資信託基金") == "富邦"
    assert issuer_of("元大期貨S&P黃金ER指數股票型期貨信託基金") == "元大"
    assert issuer_of("第一金台灣工業菁英30ETF證券投資信託基金") == "第一金"
    # 上櫃以簡稱判斷：主動／平衡前綴、簡寫別名
    assert issuer_of("主動群益科技創新") == "群益"
    assert issuer_of("平衡凱基美國TOP") == "凱基"
    assert issuer_of("大華優利美公債20") == "大華銀"
    assert issuer_of("FT投資級債20+") == "富蘭克林華美"
    assert issuer_of("某不知名投信基金") is None


def test_resolve_types_for_all_listed():
    stocks = [("2330", "台積電"), ("0050", "元大台灣50"), ("00937B", "群益ESG投等債20+"), ("00710B", "復華彭博非投等債")]
    got = resolve_types(stocks, ROWS)
    assert got == [
        {"id": "2330", "security_type": "stock", "issuer": None},
        {"id": "0050", "security_type": "etf_equity", "issuer": "元大"},
        {"id": "00937B", "security_type": "etf_bond", "issuer": "群益"},  # 上櫃：由簡稱判斷投信
        {"id": "00710B", "security_type": "etf_bond", "issuer": "復華"},
    ]
