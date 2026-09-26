"""鉅亨網台股新聞（JSON API；舊 RSS 網域 feeds.cnyes.com 已失效）。"""

import html
import re
from datetime import datetime, timezone

from loguru import logger

from crawlers.base.base_news_crawler import BaseNewsCrawler, NewsItem
from crawlers.news.stock_mention_extractor import extractor
from db.models import NewsCategoryEnum, NewsSourceEnum

API_URL = "https://api.cnyes.com/media/api/v1/newslist/category/tw_stock"
NEWS_URL = "https://news.cnyes.com/news/id/{id}"
TAG_RE = re.compile(r"<[^>]+>")


def parse_cnyes(raw: dict) -> dict | None:
    title = str(raw.get("title") or "").strip()
    if not title or not raw.get("newsId"):
        return None
    # content 是跳脫過的 HTML → 還原後去標籤，當摘要
    text = TAG_RE.sub("", html.unescape(str(raw.get("summary") or raw.get("content") or ""))).strip()
    return {
        "title": title,
        "url": NEWS_URL.format(id=raw["newsId"]),
        "published_at": datetime.fromtimestamp(int(raw.get("publishAt") or 0), tz=timezone.utc),
        "summary": text[:500] or None,
        "stock_ids": [str(s) for s in raw.get("stock") or []],
    }


class CnyesNewsCrawler(BaseNewsCrawler):
    crawler_name = "CnyesNewsCrawler"
    referer_url = "https://news.cnyes.com/"

    async def fetch_news_list(self) -> list:
        try:
            data = await self._fetch_json(API_URL, params={"limit": 30})
            return data.get("items", {}).get("data", [])
        except Exception as e:
            logger.warning(f"[{self.crawler_name}] API fetch failed: {e}")
            return []

    async def parse_news_item(self, raw) -> NewsItem | None:
        item = parse_cnyes(raw)
        if not item:
            return None
        mentioned = await extractor.extract(f"{item['title']} {item['summary'] or ''}")
        return NewsItem(
            title=item["title"],
            url=item["url"],
            source=NewsSourceEnum.CNYES,
            category=NewsCategoryEnum.MARKET,
            published_at=item["published_at"],
            summary=item["summary"],
            related_stock_ids=sorted(set(item["stock_ids"]) | set(mentioned)),
        )
