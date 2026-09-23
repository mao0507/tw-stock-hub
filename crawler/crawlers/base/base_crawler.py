import asyncio
import random
import time
from abc import ABC, abstractmethod
from datetime import date
from typing import Any

from loguru import logger

from config import settings
from db.connection import get_session
from db.repository import write_crawler_log
from monitor.alert import alert_manager
from .http_client import HttpClient


class BaseCrawler(ABC):
    crawler_name: str = "BaseCrawler"
    referer_url: str | None = None

    def __init__(self) -> None:
        self._retry_count = settings.retry_count
        self._delay_min = settings.request_delay_min
        self._delay_max = settings.request_delay_max
        self._target_date: date | None = None

    def set_target_date(self, target_date: date) -> None:
        self._target_date = target_date

    @property
    def target_date(self) -> date:
        return self._target_date or date.today()

    @abstractmethod
    async def crawl(self) -> int:
        ...

    async def run(self) -> int:
        start_time = time.monotonic()
        logger.info(f"[{self.crawler_name}] Starting...")

        try:
            count = await self._run_with_retry()
            duration_ms = int((time.monotonic() - start_time) * 1000)

            async with get_session() as session:
                await write_crawler_log(
                    session,
                    crawler_name=self.crawler_name,
                    status="success",
                    records_count=count,
                    duration_ms=duration_ms,
                )
            alert_manager.record_success(self.crawler_name)
            logger.success(f"[{self.crawler_name}] Done. {count} records in {duration_ms}ms")
            return count

        except Exception as e:
            duration_ms = int((time.monotonic() - start_time) * 1000)
            logger.error(f"[{self.crawler_name}] Failed: {e}")
            alert_manager.record_failure(self.crawler_name, str(e))

            async with get_session() as session:
                await write_crawler_log(
                    session,
                    crawler_name=self.crawler_name,
                    status="failed",
                    error_message=str(e)[:1000],
                    duration_ms=duration_ms,
                )
            raise

    async def _run_with_retry(self) -> int:
        attempt = 0
        last_error: Exception | None = None

        while attempt < self._retry_count:
            try:
                return await self.crawl()
            except Exception as e:
                attempt += 1
                last_error = e
                if attempt < self._retry_count:
                    wait = min(60 * attempt, 300)
                    logger.warning(
                        f"[{self.crawler_name}] Attempt {attempt} failed: {e}. "
                        f"Retrying in {wait}s..."
                    )
                    await asyncio.sleep(wait)

        raise last_error or RuntimeError(
            f"{self.crawler_name} failed after {self._retry_count} attempts"
        )

    async def _random_delay(self) -> None:
        delay = random.uniform(self._delay_min, self._delay_max)
        await asyncio.sleep(delay)

    async def _fetch_json(
        self,
        url: str,
        params: dict | None = None,
        headers: dict | None = None,
    ) -> Any:
        await self._random_delay()
        async with HttpClient() as client:
            response = await client.get(
                url,
                params=params,
                headers=headers,
                referer=self.referer_url,
            )
            return response.json()

    async def _fetch_text(
        self,
        url: str,
        params: dict | None = None,
    ) -> str:
        await self._random_delay()
        async with HttpClient() as client:
            response = await client.get(url, params=params, referer=self.referer_url)
            return response.text

    async def _post_text(
        self,
        url: str,
        data: dict | None = None,
        warmup_url: str | None = None,
    ) -> str:
        await self._random_delay()
        async with HttpClient() as client:
            if warmup_url:
                await client.get(warmup_url, referer=self.referer_url)
            response = await client.post(url, data=data, referer=self.referer_url)
            return response.text
