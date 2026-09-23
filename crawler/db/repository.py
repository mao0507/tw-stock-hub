from typing import Any

from loguru import logger
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert


async def bulk_upsert(
    session: AsyncSession,
    table_class: Any,
    records: list[dict],
    conflict_keys: list[str],
    batch_size: int = 500,
) -> int:
    if not records:
        return 0

    table = table_class.__table__
    total = 0

    for i in range(0, len(records), batch_size):
        batch = records[i : i + batch_size]
        stmt = insert(table).values(batch)
        update_cols = {
            col.name: stmt.excluded[col.name]
            for col in table.columns
            if col.name not in conflict_keys
        }
        stmt = stmt.on_conflict_do_update(
            index_elements=conflict_keys,
            set_=update_cols,
        )
        result = await session.execute(stmt)
        total += result.rowcount or len(batch)

    return total


async def bulk_insert_ignore(
    session: AsyncSession,
    table_class: Any,
    records: list[dict],
    conflict_key: str | list[str] = "url",
    batch_size: int = 200,
) -> int:
    if not records:
        return 0

    table = table_class.__table__
    total = 0
    index_elements = [conflict_key] if isinstance(conflict_key, str) else conflict_key

    for i in range(0, len(records), batch_size):
        batch = records[i : i + batch_size]
        stmt = insert(table).values(batch).on_conflict_do_nothing(
            index_elements=index_elements
        )
        result = await session.execute(stmt)
        total += result.rowcount or 0

    return total


async def get_existing_urls(
    session: AsyncSession,
    urls: list[str],
) -> set[str]:
    if not urls:
        return set()

    result = await session.execute(
        text("SELECT url FROM news WHERE url = ANY(:urls)"),
        {"urls": urls},
    )
    return {row[0] for row in result.fetchall()}


async def get_all_stock_map(session: AsyncSession) -> dict[str, str]:
    result = await session.execute(
        text("SELECT id, name FROM stocks WHERE is_active = true")
    )
    return {row[0]: row[1] for row in result.fetchall()}


async def write_crawler_log(
    session: AsyncSession,
    crawler_name: str,
    status: str,
    records_count: int | None = None,
    error_message: str | None = None,
    duration_ms: int | None = None,
) -> None:
    await session.execute(
        text("""
            INSERT INTO crawler_logs
                (crawler_name, status, records_count, error_message, duration_ms)
            VALUES
                (:crawler_name, :status, :records_count, :error_message, :duration_ms)
        """),
        {
            "crawler_name": crawler_name,
            "status": status,
            "records_count": records_count,
            "error_message": error_message,
            "duration_ms": duration_ms,
        },
    )
