"""除權息：預告行事曆（上市 TWT48U + 上櫃 tpex_exright_prepost），以及近期除權息個股的股利重抓。

ex_dividend_calendar 是持股「已領股利」與行事曆頁的來源；dividends 表的多年歷史由 FinMind 回補，
之後每天只針對除息日前後的股票向 FinMind 重抓（上市、上櫃、季配都能拿到正確期別與除息日）。
"""

import asyncio
import re
from datetime import date, timedelta

from loguru import logger
from sqlalchemy import text

from crawlers.base.base_crawler import BaseCrawler
from crawlers.fundamental.finmind import fetch_dividends
from crawlers.fundamental.fundamentals import OPENAPI, _fetch, _num, _roc_to_date
from db.connection import get_session
from pipeline.writer import DataWriter

TPEX_PREPOST = "https://www.tpex.org.tw/openapi/v1/tpex_exright_prepost"
CODE_RE = re.compile(r"^[0-9A-Z]{4,6}$")  # 含 00400A、00942B 這類英數 ETF 代號


def _record(ex_date: str, code: str, name: str, cash, ratio) -> dict | None:
    sid = str(code or "").strip()
    exd = _roc_to_date(ex_date or "")
    if not CODE_RE.match(sid) or not exd:
        return None
    return {
        "ex_date": exd,
        "stock_id": sid,
        "stock_name": str(name or "").strip()[:50],
        "cash_dividend": _num(cash),
        "stock_dividend_ratio": _num(ratio),
    }


def parse_twse_twt48u(rows: list[dict]) -> list[dict]:
    out = (_record(r.get("Date"), r.get("Code"), r.get("Name"), r.get("CashDividend"), r.get("StockDividendRatio"))
           for r in rows)
    return [r for r in out if r]


def parse_tpex_prepost(rows: list[dict]) -> list[dict]:
    out = (_record(r.get("ExRrightsExDividendDate"), r.get("SecuritiesCompanyCode"), r.get("CompanyName"),
                   r.get("CashDividend"), r.get("StockDividendRatio"))
           for r in rows)
    return [r for r in out if r]


class ExDividendCalendarCrawler(BaseCrawler):
    crawler_name = "ExDividendCalendarCrawler"

    async def crawl(self) -> int:
        twse = parse_twse_twt48u(await _fetch(f"{OPENAPI}/exchangeReport/TWT48U_ALL"))
        tpex = parse_tpex_prepost(await _fetch(TPEX_PREPOST))
        count = await DataWriter.write_ex_dividend(twse + tpex)
        logger.info(f"[{self.crawler_name}] {count} 筆除權息（上市 {len(twse)}、上櫃 {len(tpex)}）")
        return count


REFRESH_BEFORE = 30  # 除息日前後幾天內的股票要重抓
REFRESH_AFTER = 60
FINMIND_DELAY = 12.4  # 與 backfill_finmind 共用匿名額度（300 次/小時）


async def refresh_recent_dividends() -> int:
    """重抓近期（前 30 天～後 60 天）有除權息的股票股利。回成功檔數。"""
    today = date.today()
    async with get_session() as session:
        r = await session.execute(text(
            """
            SELECT DISTINCT c.stock_id FROM ex_dividend_calendar c
            JOIN stocks s ON s.id = c.stock_id
            WHERE c.ex_date BETWEEN :a AND :b
            ORDER BY c.stock_id
            """
        ), {"a": today - timedelta(days=REFRESH_BEFORE), "b": today + timedelta(days=REFRESH_AFTER)})
        stocks = [row[0] for row in r.fetchall()]

    start = f"{today.year - 2}-01-01"
    ok = 0
    for sid in stocks:
        try:
            await fetch_dividends(sid, start)
            ok += 1
        except Exception as e:
            logger.warning(f"[dividend_refresh] {sid} 失敗：{str(e)[:80]}")
        await asyncio.sleep(FINMIND_DELAY)
    logger.info(f"[dividend_refresh] {ok}/{len(stocks)} 檔股利已更新")
    return ok
