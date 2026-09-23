import json
from datetime import date, datetime

from loguru import logger
from sqlalchemy import text

from db.connection import get_session

CHANNEL = "crawler_done"


class NotifyPublisher:
    """爬蟲完成後以 Postgres NOTIFY 通知 api（取代 Redis pub/sub）。"""

    async def publish_done(
        self,
        crawler_name: str,
        crawl_date: date | None = None,
        count: int = 0,
    ) -> None:
        payload = json.dumps({
            "crawler": crawler_name,
            "date": str(crawl_date or date.today()),
            "count": count,
            "timestamp": int(datetime.now().timestamp()),
        })
        try:
            async with get_session() as session:
                await session.execute(
                    text("SELECT pg_notify(:channel, :payload)"),
                    {"channel": CHANNEL, "payload": payload},
                )
        except Exception as e:
            logger.warning(f"[Notify] publish failed: {e}")


publisher = NotifyPublisher()
