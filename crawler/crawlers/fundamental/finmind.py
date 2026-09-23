"""FinMind 歷史基本面：多年月營收 / 財報(EPS/獲利) / 股利。

FinMind 開放 API（api.finmindtrade.com）含多年歷史，逐檔查詢。
無 token 也可用但有流量限制 → 採 on-demand（看個股時補該股歷史）。
可設 FINMIND_TOKEN 提高額度。

單位對齊既有表：營收/財報金額存「千元」（FinMind 給「元」→ /1000）。
年月/年度存民國（與 TWSE 爬蟲一致）。
"""

import re
from datetime import date

import httpx
from loguru import logger

from config import settings
from pipeline.writer import DataWriter

API = "https://api.finmindtrade.com/api/v4/data"

# FinMind 財報 type → 我們的欄位
FIN_MAP = {
    "Revenue": "revenue",
    "GrossProfit": "gross_profit",
    "OperatingIncome": "op_income",
    "PreTaxIncome": "pretax_income",
    "IncomeAfterTaxes": "net_income",
    "EPS": "eps",
    "CostOfGoodsSold": "cost_of_goods_sold",
    "OperatingExpenses": "op_expenses",
    "TotalNonoperatingIncomeAndExpense": "non_op_income",
}

# FinMind 資產負債表：type 與 origin_name 雙比對（FinMind 欄位名偶有版本差異）
BS_TYPE_MAP = {
    "TotalAssets": "total_assets",
    "Equity": "total_equity",
    "TotalEquity": "total_equity",
    "CurrentAssets": "current_assets",
    "CurrentLiabilities": "current_liabilities",
    "AccountsReceivableNet": "accounts_receivable",
    "Inventories": "inventories",
    "ContractLiabilitiesCurrent": "contract_liabilities",
}
BS_NAME_MAP = {
    "資產總額": "total_assets",
    "資產總計": "total_assets",
    "權益總額": "total_equity",
    "權益總計": "total_equity",
    "流動資產合計": "current_assets",
    "流動負債合計": "current_liabilities",
    "應收帳款淨額": "accounts_receivable",
    "存貨": "inventories",
    "合約負債－流動": "contract_liabilities",
    "合約負債-流動": "contract_liabilities",
}


async def _fetch(dataset: str, stock_id: str, start_date: str) -> list:
    params = {"dataset": dataset, "data_id": stock_id, "start_date": start_date}
    if settings.finmind_token:
        params["token"] = settings.finmind_token
    async with httpx.AsyncClient(timeout=40, verify=False) as c:
        r = await c.get(API, params=params)
        r.raise_for_status()
        d = r.json()
        if d.get("status") != 200:
            raise RuntimeError(f"FinMind {dataset}: {d.get('msg')}")
        return d.get("data", [])


def _q_from_date(date_str: str) -> tuple[int, int] | None:
    """'2026-03-31' → (year, quarter)。"""
    try:
        y, m, _ = date_str.split("-")
        q = {"03": 1, "06": 2, "09": 3, "12": 4}.get(m)
        return (int(y), q) if q else None
    except ValueError:
        return None


def _roc_year(西元: int) -> str:
    return str(西元 - 1911)


async def fetch_revenue(stock_id: str, start: str) -> int:
    rows = await _fetch("TaiwanStockMonthRevenue", stock_id, start)
    rows.sort(key=lambda r: (r["revenue_year"], r["revenue_month"]))
    records = []
    by_ym: dict[tuple, int] = {}
    for r in rows:
        by_ym[(r["revenue_year"], r["revenue_month"])] = int(r["revenue"])
    for r in rows:
        y, m = r["revenue_year"], r["revenue_month"]
        rev = int(r["revenue"])
        prev_m = by_ym.get((y, m - 1) if m > 1 else (y - 1, 12))
        prev_y = by_ym.get((y - 1, m))
        records.append({
            "stock_id": stock_id,
            "year_month": f"{_roc_year(y):>3}{m:02d}".replace(" ", "0"),
            "revenue": rev // 1000,  # 元 → 千元
            "mom_pct": round((rev - prev_m) / prev_m * 100, 2) if prev_m else None,
            "yoy_pct": round((rev - prev_y) / prev_y * 100, 2) if prev_y else None,
            "cum_revenue": None,
            "cum_yoy_pct": None,
        })
    return await DataWriter.write_monthly_revenue(records)


async def fetch_financials(stock_id: str, start: str) -> int:
    rows = await _fetch("TaiwanStockFinancialStatements", stock_id, start)
    # 長表 → 以 date 聚合 {type: value}
    by_date: dict[str, dict] = {}
    for r in rows:
        t = r.get("type")
        if t in FIN_MAP:
            by_date.setdefault(r["date"], {})[FIN_MAP[t]] = r.get("value")
    records = []
    for date_str, vals in by_date.items():
        yq = _q_from_date(date_str)
        if not yq:
            continue
        y, q = yq
        records.append({
            "stock_id": stock_id, "year": y, "quarter": q,
            "revenue": _k(vals.get("revenue")),
            "gross_profit": _k(vals.get("gross_profit")),
            "op_income": _k(vals.get("op_income")),
            "pretax_income": _k(vals.get("pretax_income")),
            "net_income": _k(vals.get("net_income")),
            "eps": round(vals["eps"], 2) if vals.get("eps") is not None else None,
            "cost_of_goods_sold": _k(vals.get("cost_of_goods_sold")),
            "op_expenses": _k(vals.get("op_expenses")),
            "non_op_income": _k(vals.get("non_op_income")),
        })
    return await DataWriter.write_financials(records)


async def fetch_balance_sheet(stock_id: str, start: str) -> int:
    """資產負債表：ROE/ROA、杜邦、週轉天數、合約負債比所需科目。"""
    rows = await _fetch("TaiwanStockBalanceSheet", stock_id, start)
    by_date: dict[str, dict] = {}
    for r in rows:
        t = str(r.get("type", ""))
        # FinMind 每科目有絕對值列與 _per（占總資產%）列，origin_name 相同 → 只取絕對值
        if t.endswith("_per"):
            continue
        col = BS_TYPE_MAP.get(t) or BS_NAME_MAP.get(str(r.get("origin_name", "")).strip())
        if col:
            # 同科目重複出現時保留首見值（合併報表科目唯一，防禦性處理）
            by_date.setdefault(r["date"], {}).setdefault(col, r.get("value"))
    records = []
    for date_str, vals in by_date.items():
        yq = _q_from_date(date_str)
        if not yq:
            continue
        y, q = yq
        records.append({
            "stock_id": stock_id, "year": y, "quarter": q,
            **{col: _k(vals.get(col)) for col in (
                "total_assets", "total_equity", "current_assets", "current_liabilities",
                "accounts_receivable", "inventories", "contract_liabilities",
            )},
        })
    return await DataWriter.write_balance_sheets(records)


def _dividend_records(stock_id: str, rows: list[dict]) -> list[dict]:
    """FinMind year 欄僅民國年（無季別），季配息一年多筆 → 以除息日去重，
    同年再依除息日排序給 period（1..n），對齊 TWSE「期別」序。"""
    parsed: list[dict] = []
    for r in rows:
        year_raw = str(r.get("year", ""))
        roc = "".join(ch for ch in year_raw.split("年")[0] if ch.isdigit())
        if not roc:
            continue
        cash = (r.get("CashEarningsDistribution") or 0) + (r.get("CashStatutorySurplus") or 0)
        stock = (r.get("StockEarningsDistribution") or 0) + (r.get("StockStatutorySurplus") or 0)
        ex = (r.get("CashExDividendTradingDate") or r.get("StockExDividendTradingDate") or "").strip()
        ex_date = date.fromisoformat(ex) if re.match(r"^\d{4}-\d{2}-\d{2}$", ex) else None
        parsed.append({
            "roc": roc, "ex_date": ex_date,
            "cash_dividend": round(cash, 4), "stock_dividend": round(stock, 4),
        })

    # 以 (roc, ex_date) 去重（無除息日者退回單筆年配）
    dedup: dict[tuple, dict] = {}
    for p in parsed:
        dedup[(p["roc"], p["ex_date"])] = p

    # 同年依除息日排序 → period 1..n（None 排最後）
    by_year: dict[str, list[dict]] = {}
    for p in dedup.values():
        by_year.setdefault(p["roc"], []).append(p)

    records: list[dict] = []
    for roc, items in by_year.items():
        items.sort(key=lambda x: (x["ex_date"] is None, x["ex_date"] or date.min))
        for i, p in enumerate(items, 1):
            records.append({
                "stock_id": stock_id, "dividend_year": roc, "period": str(i),
                "cash_dividend": p["cash_dividend"], "stock_dividend": p["stock_dividend"],
                "ex_dividend_date": p["ex_date"],
            })
    return records


async def fetch_dividends(stock_id: str, start: str) -> int:
    rows = await _fetch("TaiwanStockDividend", stock_id, start)
    return await DataWriter.write_dividends(_dividend_records(stock_id, rows))


def _k(v) -> int | None:
    """元 → 千元。"""
    return int(v / 1000) if v is not None else None


def _selfcheck() -> None:
    # 00878 季配：同民國年多筆 → period 依除息日 1..n
    rows = [
        {"year": "110", "CashExDividendTradingDate": "2021-08-17", "CashEarningsDistribution": 0.30},
        {"year": "110", "CashExDividendTradingDate": "2021-02-25", "CashEarningsDistribution": 0.15},
        {"year": "110", "CashExDividendTradingDate": "2021-05-18", "CashEarningsDistribution": 0.25},
        {"year": "110年", "CashExDividendTradingDate": "2021-11-16", "CashEarningsDistribution": 0.28},
        {"year": "109", "CashExDividendTradingDate": "2020-11-17", "CashEarningsDistribution": 0.05},
    ]
    recs = _dividend_records("00878", rows)
    y110 = sorted((r for r in recs if r["dividend_year"] == "110"), key=lambda r: r["period"])
    assert [r["period"] for r in y110] == ["1", "2", "3", "4"], y110
    assert [str(r["ex_dividend_date"]) for r in y110] == [
        "2021-02-25", "2021-05-18", "2021-08-17", "2021-11-16"], y110
    y109 = [r for r in recs if r["dividend_year"] == "109"]
    assert len(y109) == 1 and y109[0]["period"] == "1", y109
    print("finmind dividend self-check ok")


async def fetch_valuation(stock_id: str, start: str) -> int:
    """補單一股票歷史 PE/PB/殖利率（FinMind TaiwanStockPER，免費額度可用）。"""
    rows = await _fetch("TaiwanStockPER", stock_id, start)
    records = [{
        "date": date.fromisoformat(r["date"]),
        "stock_id": stock_id,
        "pe": r.get("PER"),
        "pb": r.get("PBR"),
        "dividend_yield": r.get("dividend_yield"),
    } for r in rows if r.get("date")]
    return await DataWriter.write_valuations(records)


# 大戶持股分級歷史（FinMind TaiwanStockHoldingSharesPer）需付費方案才能取用，
# 免費額度會回 400「Your level is free」。TDCC opendata 官方入口本身也只提供最新一期快照、
# 無歷史區間查詢參數。故大戶持股目前無可行的免費歷史回補管道，只能靠 ShareholderDispersionCrawler
# 每日快照隨時間自然累積，非程式邏輯可解決的缺口。


async def fetch_stock_history(stock_id: str, start: str = "2019-01-01") -> dict:
    """補單一股票的多年歷史。回各資料筆數。"""
    out = {}
    for name, fn in (
        ("revenue", fetch_revenue), ("financials", fetch_financials),
        ("balance_sheet", fetch_balance_sheet),
        ("dividends", fetch_dividends), ("valuation", fetch_valuation),
    ):
        try:
            out[name] = await fn(stock_id, start)
        except Exception as e:
            logger.warning(f"[FinMind] {stock_id} {name} 失敗: {e}")
            out[name] = 0
    logger.info(f"[FinMind] {stock_id} 歷史: {out}")
    return out


if __name__ == "__main__":
    _selfcheck()
