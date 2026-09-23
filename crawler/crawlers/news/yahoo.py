from datetime import datetime, timezone
from bs4 import BeautifulSoup
from loguru import logger
from crawlers.base.base_news_crawler import BaseNewsCrawler, NewsItem
from db.models import NewsSourceEnum, NewsCategoryEnum
from db.connection import get_session
from db.repository import get_all_stock_map


class YahooFinanceNewsCrawler(BaseNewsCrawler):
    crawler_name = "YahooFinanceNewsCrawler"
    referer_url = "https://tw.stock.yahoo.com/"
    BASE_URL = "https://tw.stock.yahoo.com/quote/{stock_id}/news"
    MAX_STOCKS = 50

    async def fetch_news_list(self) -> list[dict]:
        async with get_session() as session:
            stock_map = await get_all_stock_map(session)

        stock_ids = list(stock_map.keys())[:self.MAX_STOCKS]

        all_items = []
        for stock_id in stock_ids:
            try:
                items = await self._fetch_stock_news(stock_id)
                all_items.extend(items)
                await self._random_delay()
            except Exception as e:
                logger.warning(f"[{self.crawler_name}] {stock_id} failed: {e}")
                continue

        return all_items

    async def _fetch_stock_news(self, stock_id: str) -> list[dict]:
        url = self.BASE_URL.format(stock_id=stock_id)
        html = await self._fetch_text(url)
        soup = BeautifulSoup(html, "lxml")

        items = []
        for article in soup.select("li.js-stream-content, div[data-testid='news-item']"):
            try:
                a_tag = article.find("a", href=True)
                if not a_tag:
                    continue
                title = a_tag.get_text(strip=True)
                link = a_tag["href"]
                if not link.startswith("http"):
                    link = f"https://tw.stock.yahoo.com{link}"

                items.append({
                    "title": title,
                    "url": link,
                    "stock_id": stock_id,
                    "published_at": datetime.now(timezone.utc),
                })
            except Exception:
                continue

        return items

    async def parse_news_item(self, raw: dict) -> NewsItem | None:
        if not raw.get("title") or not raw.get("url"):
            return None

        return NewsItem(
            title=raw["title"],
            url=raw["url"],
            source=NewsSourceEnum.YAHOO,
            category=NewsCategoryEnum.MARKET,
            published_at=raw.get("published_at", datetime.now(timezone.utc)),
            related_stock_ids=[raw["stock_id"]] if raw.get("stock_id") else [],
        )
