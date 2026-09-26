"""基本面爬蟲：月營收、財報(EPS/獲利)、股利、大戶持股、除權息行事曆（估值見 valuation.py）。

資料源：TWSE OpenAPI（openapi.twse.com.tw）+ TDCC OpenData（集保戶股權分散）。
皆為「最新快照」端點，crawl() 抓全部上市公司寫入。上市(TWSE)為主。
"""

import csv
import io
import re
from datetime import date

import httpx
from loguru import logger
from sqlalchemy import text

from crawlers.base.base_crawler import BaseCrawler
from crawlers.fundamental.ytd import FIELDS as YTD_FIELDS, to_single_quarter
from db.connection import get_session
from pipeline.writer import DataWriter

OPENAPI = "https://openapi.twse.com.tw/v1"
TDCC_URL = "https://opendata.tdcc.com.tw/getOD.ashx?id=1-5"


def _num(v) -> float | None:
    """字串數字 → float。空/非數字回 None。會去除逗號與 HTML。"""
    if v is None:
        return None
    s = re.sub(r"<[^>]+>", "", str(v)).replace(",", "").strip()
    if s in ("", "-", "--", "N/A"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _int(v) -> int | None:
    f = _num(v)
    return int(f) if f is not None else None


def _roc_to_date(roc: str) -> date | None:
    """民國日期字串 → date。支援 '1150627' 或 '115年07月09日'。"""
    s = re.sub(r"[^\d]", "", str(roc))
    if len(s) < 7:
        return None
    try:
        y = int(s[:3]) + 1911
        m = int(s[3:5])
        d = int(s[5:7])
        return date(y, m, d)
    except ValueError:
        return None


async def _fetch(url: str) -> list:
    async with httpx.AsyncClient(timeout=60, verify=False) as c:
        r = await c.get(url)
        r.raise_for_status()
        return r.json()


class MonthlyRevenueCrawler(BaseCrawler):
    crawler_name = "MonthlyRevenueCrawler"

    async def crawl(self) -> int:
        data = await _fetch(f"{OPENAPI}/opendata/t187ap05_L")
        records = []
        for r in data:
            sid = str(r.get("公司代號", "")).strip()
            ym = str(r.get("資料年月", "")).strip()
            if not sid.isdigit() or len(ym) < 5:
                continue
            records.append({
                "stock_id": sid,
                "year_month": ym,
                "revenue": _int(r.get("營業收入-當月營收")),
                "mom_pct": _num(r.get("營業收入-上月比較增減(%)")),
                "yoy_pct": _num(r.get("營業收入-去年同月增減(%)")),
                "cum_revenue": _int(r.get("累計營業收入-當月累計營收")),
                "cum_yoy_pct": _num(r.get("累計營業收入-前期比較增減(%)")),
            })
        count = await DataWriter.write_monthly_revenue(records)
        logger.info(f"[{self.crawler_name}] {count} 筆月營收")
        return count


async def _load_prior_quarters(records: list[dict]) -> dict:
    """讀取這批資料同年度、較早季別的單季值：{stock_id: {(year, quarter): row}}"""
    years = sorted({r["year"] for r in records if r["quarter"] > 1})
    if not years:
        return {}
    cols = ", ".join(YTD_FIELDS)
    async with get_session() as session:
        rows = (await session.execute(
            text(f"SELECT stock_id, year, quarter, {cols} FROM financial_statements WHERE year = ANY(:years)"),
            {"years": years},
        )).mappings().all()
    prior: dict = {}
    for row in rows:
        values = {f: (float(row[f]) if f == "eps" and row[f] is not None else row[f]) for f in YTD_FIELDS}
        prior.setdefault(row["stock_id"], {})[(row["year"], row["quarter"])] = values
    return prior


class FinancialStatementCrawler(BaseCrawler):
    crawler_name = "FinancialStatementCrawler"

    async def crawl(self) -> int:
        data = await _fetch(f"{OPENAPI}/opendata/t187ap06_L_ci")
        records = []
        for r in data:
            sid = str(r.get("公司代號", "")).strip()
            year = _int(r.get("年度"))
            quarter = _int(r.get("季別"))
            if not sid.isdigit() or year is None or quarter is None:
                continue
            records.append({
                "stock_id": sid,
                "year": year + 1911 if year < 1911 else year,
                "quarter": quarter,
                "revenue": _int(r.get("營業收入")),
                "gross_profit": _int(r.get("營業毛利（毛損）淨額")) or _int(r.get("營業毛利（毛損）")),
                "op_income": _int(r.get("營業利益（損失）")),
                "pretax_income": _int(r.get("稅前淨利（淨損）")),
                "net_income": _int(r.get("本期淨利（淨損）")),
                "eps": _num(r.get("基本每股盈餘（元）")),
            })
        # OpenAPI 為年初至今累計，換算成單季；前幾季單季資料不齊的筆數略過
        singles = to_single_quarter(records, await _load_prior_quarters(records))
        skipped = len(records) - len(singles)
        if skipped:
            logger.warning(f"[{self.crawler_name}] {skipped} 筆缺前幾季單季資料，無法由累計換算，略過")
        count = await DataWriter.write_financials(singles)
        logger.info(f"[{self.crawler_name}] {count} 筆財報")
        return count


class DividendCrawler(BaseCrawler):
    crawler_name = "DividendCrawler"

    async def crawl(self) -> int:
        data = await _fetch(f"{OPENAPI}/opendata/t187ap45_L")
        # 同股同年同期可能有多筆（不同決議進度）→ 以 key 去重，後者覆蓋
        dedup: dict[tuple, dict] = {}
        for r in data:
            sid = str(r.get("公司代號", "")).strip()
            dyear = str(r.get("股利年度", "")).strip()
            period = str(r.get("期別", "1")).strip() or "1"
            if not sid.isdigit() or not dyear:
                continue
            # 來源偶有異常股利年度欄位（如 "1911"、"1144114"），非合理民國年（90~150）即捨棄
            if not dyear.isdigit() or not (90 <= int(dyear) <= 150):
                logger.warning(f"[{self.crawler_name}] {sid} 股利年度異常 dividend_year={dyear!r}，捨棄該筆")
                continue
            cash = (_num(r.get("股東配發-盈餘分配之現金股利(元/股)")) or 0) + \
                   (_num(r.get("股東配發-法定盈餘公積發放之現金(元/股)")) or 0) + \
                   (_num(r.get("股東配發-資本公積發放之現金(元/股)")) or 0)
            stock = (_num(r.get("股東配發-盈餘轉增資配股(元/股)")) or 0) + \
                    (_num(r.get("股東配發-法定盈餘公積轉增資配股(元/股)")) or 0) + \
                    (_num(r.get("股東配發-資本公積轉增資配股(元/股)")) or 0)
            dedup[(sid, dyear, period)] = {
                "stock_id": sid, "dividend_year": dyear, "period": period,
                "cash_dividend": round(cash, 4), "stock_dividend": round(stock, 4),
                "ex_dividend_date": None,
            }
        count = await DataWriter.write_dividends(list(dedup.values()))
        logger.info(f"[{self.crawler_name}] {count} 筆股利")
        return count


class ExDividendCalendarCrawler(BaseCrawler):
    crawler_name = "ExDividendCalendarCrawler"

    async def crawl(self) -> int:
        data = await _fetch(f"{OPENAPI}/exchangeReport/TWT48U_ALL")
        records = []
        for r in data:
            sid = str(r.get("Code", "")).strip()
            exd = _roc_to_date(r.get("Date", ""))
            if not sid.isdigit() or not exd:
                continue
            records.append({
                "ex_date": exd,
                "stock_id": sid,
                "stock_name": str(r.get("Name", "")).strip()[:50],
                "cash_dividend": _num(r.get("CashDividend")),
                "stock_dividend_ratio": _num(r.get("StockDividendRatio")),
            })
        count = await DataWriter.write_ex_dividend(records)
        logger.info(f"[{self.crawler_name}] {count} 筆除權息")
        return count


class ShareholderDispersionCrawler(BaseCrawler):
    crawler_name = "ShareholderDispersionCrawler"
    # TDCC 持股分級：15 = 1,000,001 股以上（>1000 張，大戶）；17 = 合計
    BIG_LEVEL = "15"
    TOTAL_LEVEL = "17"

    async def crawl(self) -> int:
        async with httpx.AsyncClient(timeout=90, verify=False) as c:
            r = await c.get(TDCC_URL)
            r.raise_for_status()
            text = r.text.lstrip("﻿")  # 去除 BOM，否則第一欄 key 對不到

        # 以 (日期, 證券代號) 聚合：大戶占比/人數 + 總人數
        big: dict[tuple, dict] = {}
        for row in csv.DictReader(io.StringIO(text)):
            sid = str(row.get("證券代號", "")).strip()
            if not sid.isdigit():
                continue
            d = _roc_to_date_ad(row.get("資料日期", ""))
            if not d:
                continue
            key = (d, sid)
            slot = big.setdefault(key, {"big_pct": None, "big_cnt": None, "total": None})
            level = str(row.get("持股分級", "")).strip()
            if level == self.BIG_LEVEL:
                slot["big_pct"] = _num(row.get("占集保庫存數比例%"))
                slot["big_cnt"] = _int(row.get("人數"))
            elif level == self.TOTAL_LEVEL:
                slot["total"] = _int(row.get("人數"))

        records = [
            {
                "date": d, "stock_id": sid,
                "big_holder_pct": v["big_pct"],
                "big_holder_count": v["big_cnt"],
                "total_holders": v["total"],
            }
            for (d, sid), v in big.items()
        ]
        count = await DataWriter.write_dispersion(records)
        logger.info(f"[{self.crawler_name}] {count} 筆大戶持股")
        return count


def _roc_to_date_ad(s: str) -> date | None:
    """TDCC 資料日期為西元 'YYYYMMDD'（如 20260626）。"""
    s = re.sub(r"[^\d]", "", str(s))
    if len(s) != 8:
        return None
    try:
        return date(int(s[:4]), int(s[4:6]), int(s[6:8]))
    except ValueError:
        return None
