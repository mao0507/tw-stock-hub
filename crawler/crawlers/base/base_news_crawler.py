from abc import abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from loguru import logger
from sqlalchemy import text

from db.connection import get_session
from db.models import NewsModel, NewsStockRelationModel, NewsCategoryEnum, NewsSourceEnum
from db.repository import bulk_insert_ignore, get_existing_urls
from .base_crawler import BaseCrawler


@dataclass
class NewsItem:
    title: str
    url: str
    source: NewsSourceEnum
    category: NewsCategoryEnum
    published_at: datetime
    summary: str | None = None
    is_mops_permanent: bool = False
    related_stock_ids: list[str] = field(default_factory=list)


class BaseNewsCrawler(BaseCrawler):
    @abstractmethod
    async def fetch_news_list(self) -> list[Any]:
        ...

    @abstractmethod
    async def parse_news_item(self, raw: Any) -> NewsItem | None:
        ...

    async def crawl(self) -> int:
        raw_list = await self.fetch_news_list()
        logger.debug(f"[{self.crawler_name}] Fetched {len(raw_list)} raw items")

        parsed: list[NewsItem] = []
        for raw in raw_list:
            try:
                item = await self.parse_news_item(raw)
                if item:
                    parsed.append(item)
            except Exception as e:
                logger.warning(f"[{self.crawler_name}] Parse error: {e}")
                continue

        if not parsed:
            return 0

        urls = [item.url for item in parsed]
        async with get_session() as session:
            existing_urls = await get_existing_urls(session, urls)

        new_items = [item for item in parsed if item.url not in existing_urls]
        logger.debug(
            f"[{self.crawler_name}] {len(parsed)} parsed, "
            f"{len(existing_urls)} existing, {len(new_items)} new"
        )

        if not new_items:
            return 0

        return await self._write_news(new_items)

    async def _write_news(self, items: list[NewsItem]) -> int:
        news_records = [
            {
                "title": item.title,
                "summary": item.summary,
                "source": item.source.value,
                "url": item.url,
                "published_at": item.published_at,
                "category": item.category.value,
                "is_mops_permanent": item.is_mops_permanent,
            }
            for item in items
        ]

        async with get_session() as session:
            count = await bulk_insert_ignore(
                session, NewsModel, news_records, conflict_key=["url", "published_at"]
            )

            urls = [item.url for item in items]
            result = await session.execute(
                text("SELECT id, url FROM news WHERE url = ANY(:urls)"),
                {"urls": urls},
            )
            url_to_id = {row[1]: str(row[0]) for row in result.fetchall()}

            relations = []
            for item in items:
                news_id = url_to_id.get(item.url)
                if not news_id:
                    continue
                for stock_id in item.related_stock_ids:
                    relations.append({"news_id": news_id, "stock_id": stock_id})

            if relations:
                await bulk_insert_ignore(
                    session,
                    NewsStockRelationModel,
                    relations,
                    conflict_key=["news_id", "stock_id"],
                )

        return count
