import feedparser
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from loguru import logger
from crawlers.base.base_news_crawler import BaseNewsCrawler, NewsItem
from crawlers.news.stock_mention_extractor import extractor
from db.models import NewsSourceEnum, NewsCategoryEnum


class CnyesNewsCrawler(BaseNewsCrawler):
    crawler_name = "CnyesNewsCrawler"
    RSS_URL = "https://feeds.cnyes.com/market/tw/news.rss"

    async def fetch_news_list(self) -> list:
        try:
            response_text = await self._fetch_text(self.RSS_URL)
            feed = feedparser.parse(response_text)
            return feed.entries
        except Exception as e:
            logger.warning(f"[{self.crawler_name}] RSS fetch failed: {e}")
            return []

    async def parse_news_item(self, raw) -> NewsItem | None:
        try:
            title = getattr(raw, "title", "").strip()
            url = getattr(raw, "link", "").strip()
            summary = getattr(raw, "summary", None)

            if not title or not url:
                return None

            published_at = datetime.now(timezone.utc)
            if hasattr(raw, "published"):
                try:
                    published_at = parsedate_to_datetime(raw.published)
                except Exception:
                    pass

            full_text = f"{title} {summary or ''}"
            stock_ids = await extractor.extract(full_text)

            return NewsItem(
                title=title,
                url=url,
                source=NewsSourceEnum.CNYES,
                category=NewsCategoryEnum.MARKET,
                published_at=published_at,
                summary=summary[:500] if summary else None,
                related_stock_ids=stock_ids,
            )
        except Exception as e:
            logger.warning(f"[{self.crawler_name}] parse error: {e}")
            return None
