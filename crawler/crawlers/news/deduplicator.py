from loguru import logger
from db.connection import get_session
from db.repository import get_existing_urls


class NewsDeduplicator:
    async def filter_new(self, items: list) -> list:
        if not items:
            return []

        urls = [item.url for item in items]

        async with get_session() as session:
            existing = await get_existing_urls(session, urls)

        new_items = [item for item in items if item.url not in existing]

        logger.debug(
            f"[Deduplicator] {len(items)} items, "
            f"{len(existing)} existing, "
            f"{len(new_items)} new"
        )
        return new_items

    async def is_new_url(self, url: str) -> bool:
        async with get_session() as session:
            existing = await get_existing_urls(session, [url])
        return url not in existing
