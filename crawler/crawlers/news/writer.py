from loguru import logger
from sqlalchemy import text

from db.connection import get_session
from db.models import NewsModel, NewsStockRelationModel
from db.repository import bulk_insert_ignore


class NewsWriter:
    async def write(self, news_record: dict, stock_ids: list[str]) -> bool:
        async with get_session() as session:
            result = await bulk_insert_ignore(
                session, NewsModel, [news_record], conflict_key="url"
            )

            row = await session.execute(
                text("SELECT id FROM news WHERE url = :url"),
                {"url": news_record["url"]},
            )
            existing = row.fetchone()
            if not existing:
                return False

            news_id = str(existing[0])
            is_new = result > 0

            if stock_ids:
                relations = [{"news_id": news_id, "stock_id": sid} for sid in stock_ids]
                await bulk_insert_ignore(
                    session, NewsStockRelationModel, relations, conflict_key="news_id"
                )

        return is_new

    async def write_batch(
        self,
        news_records: list[dict],
        stock_ids_map: dict[str, list[str]],
    ) -> int:
        if not news_records:
            return 0

        async with get_session() as session:
            count = await bulk_insert_ignore(
                session, NewsModel, news_records, conflict_key="url"
            )

            urls = [r["url"] for r in news_records]
            result = await session.execute(
                text("SELECT id, url FROM news WHERE url = ANY(:urls)"),
                {"urls": urls},
            )
            url_to_id = {row[1]: str(row[0]) for row in result.fetchall()}

            relations: list[dict] = []
            for url, news_id in url_to_id.items():
                for sid in stock_ids_map.get(url, []):
                    relations.append({"news_id": news_id, "stock_id": sid})

            if relations:
                seen: set[tuple] = set()
                unique_relations = []
                for r in relations:
                    key = (r["news_id"], r["stock_id"])
                    if key not in seen:
                        seen.add(key)
                        unique_relations.append(r)

                await bulk_insert_ignore(
                    session, NewsStockRelationModel, unique_relations, conflict_key="news_id"
                )

        logger.debug(f"[NewsWriter] {count} news written, {len(relations)} relations")
        return count


news_writer = NewsWriter()
