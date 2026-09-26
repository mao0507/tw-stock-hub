"""個股估值（本益比 / 股價淨值比 / 殖利率）：上市 TWSE、上櫃 TPEx，皆可指定日期。

每天一個請求取得全市場，歷史回補（scripts/backfill_history.py）與每日排程共用。
欄位一律依欄名取值：TWSE 早年回應的欄位順序與現在不同。
"""

from datetime import date

from loguru import logger

from crawlers.base.base_crawler import BaseCrawler
from crawlers.fundamental.fundamentals import _num
from pipeline.notify import publisher
from pipeline.writer import DataWriter

TWSE_URL = "https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU_d"
TPEX_URL = "https://www.tpex.org.tw/www/zh-tw/afterTrading/peQryDate"


def _rows(fields: list, data: list, d: date, code: str, pe: str, pb: str, dy: str) -> list[dict]:
    idx = {f: i for i, f in enumerate(fields)}
    if code not in idx:
        return []
    get = lambda row, f: row[idx[f]] if f in idx and idx[f] < len(row) else None  # noqa: E731
    out = []
    for row in data:
        sid = str(get(row, code) or "").strip()
        if not sid.isdigit():
            continue
        out.append({
            "date": d,
            "stock_id": sid,
            "pe": _num(get(row, pe)),
            "pb": _num(get(row, pb)),
            "dividend_yield": _num(get(row, dy)),
        })
    return out


def parse_twse(payload: dict, d: date) -> list[dict]:
    if payload.get("stat") != "OK":
        return []  # 休市日回「很抱歉，沒有符合條件的資料!」
    return _rows(payload.get("fields") or [], payload.get("data") or [], d,
                 "證券代號", "本益比", "股價淨值比", "殖利率(%)")


def parse_tpex(payload: dict, d: date) -> list[dict]:
    out = []
    for t in payload.get("tables") or []:
        out += _rows(t.get("fields") or [], t.get("data") or [], d,
                     "股票代號", "本益比", "股價淨值比", "殖利率(%)")
    return out


class _ValuationBase(BaseCrawler):
    async def _save(self, records: list[dict]) -> int:
        d = self.target_date
        count = await DataWriter.write_valuations(records)
        await publisher.publish_done(self.crawler_name, d, count)
        logger.info(f"[{self.crawler_name}] {count} 筆估值 @ {d}")
        return count


class ValuationCrawler(_ValuationBase):
    crawler_name = "ValuationCrawler"
    referer_url = "https://www.twse.com.tw/zh/trading/historical/bwibbu-day.html"

    async def crawl(self) -> int:
        d = self.target_date
        payload = await self._fetch_json(
            TWSE_URL, params={"date": d.strftime("%Y%m%d"), "selectType": "ALL", "response": "json"})
        return await self._save(parse_twse(payload, d))


class ValuationTPEXCrawler(_ValuationBase):
    crawler_name = "ValuationTPEXCrawler"
    referer_url = "https://www.tpex.org.tw/zh-tw/mainboard/trading/info/pe-ratio.html"

    async def crawl(self) -> int:
        d = self.target_date
        payload = await self._fetch_json(
            TPEX_URL, params={"date": d.strftime("%Y/%m/%d"), "response": "json"})
        return await self._save(parse_tpex(payload, d))
