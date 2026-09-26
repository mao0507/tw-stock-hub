"""Yahoo 股市個股新聞：成交值前 MAX_STOCKS 檔的個股 RSS（含發布時間）。"""

from email.utils import parsedate_to_datetime

import feedparser
from loguru import logger
from sqlalchemy import text

from crawlers.base.base_news_crawler import BaseNewsCrawler, NewsItem
from db.connection import get_session
from db.models import NewsCategoryEnum, NewsSourceEnum

RSS_URL = "https://tw.stock.yahoo.com/rss"


def yahoo_symbol(stock_id: str, market: str) -> str:
    return f"{stock_id}.{'TWO' if market == 'TPEX' else 'TW'}"


def parse_yahoo_entry(entry: dict, stock_id: str) -> dict | None:
    title = str(entry.get("title") or "").strip()
    url = str(entry.get("link") or "").strip()
    if not title or not url:
        return None
    # 沒有發布時間就略過：唯一鍵含 published_at，用抓取時間會每次重複寫入
    try:
        published = parsedate_to_datetime(entry["published"])
    except (KeyError, TypeError, ValueError):
        return None
    return {
        "title": title,
        "url": url,
        "published_at": published,
        "summary": (str(entry.get("summary") or "").strip()[:500]) or None,
        "stock_ids": [stock_id],
    }


class YahooFinanceNewsCrawler(BaseNewsCrawler):
    crawler_name = "YahooFinanceNewsCrawler"
    referer_url = "https://tw.stock.yahoo.com/"
    MAX_STOCKS = 50

    async def _top_stocks(self) -> list[tuple[str, str]]:
        async with get_session() as session:
            r = await session.execute(text(
                """
                SELECT s.id, s.market::text FROM stocks s
                JOIN daily_quotes q ON q.stock_id = s.id
                  AND q.date = (SELECT MAX(date) FROM daily_quotes WHERE date > CURRENT_DATE - 14)
                WHERE s.is_active ORDER BY q.value DESC LIMIT :n
                """
            ), {"n": self.MAX_STOCKS})
            return [(row[0], row[1]) for row in r.fetchall()]

    async def fetch_news_list(self) -> list[dict]:
        items: list[dict] = []
        for stock_id, market in await self._top_stocks():
            try:
                xml = await self._fetch_text(RSS_URL, params={"s": yahoo_symbol(stock_id, market)})
                for entry in feedparser.parse(xml).entries:
                    item = parse_yahoo_entry(entry, stock_id)
                    if item:
                        items.append(item)
            except Exception as e:
                logger.warning(f"[{self.crawler_name}] {stock_id} failed: {e}")
        # 同一則新聞可能出現在多檔的 RSS → 以網址合併相關個股
        merged: dict[str, dict] = {}
        for it in items:
            if it["url"] in merged:
                merged[it["url"]]["stock_ids"] = sorted(set(merged[it["url"]]["stock_ids"]) | set(it["stock_ids"]))
            else:
                merged[it["url"]] = it
        return list(merged.values())

    async def parse_news_item(self, raw: dict) -> NewsItem | None:
        return NewsItem(
            title=raw["title"],
            url=raw["url"],
            source=NewsSourceEnum.YAHOO,
            category=NewsCategoryEnum.MARKET,
            published_at=raw["published_at"],
            summary=raw["summary"],
            related_stock_ids=raw["stock_ids"],
        )
