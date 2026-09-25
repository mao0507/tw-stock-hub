#!/usr/bin/env python
"""補抓大盤指數、類股指數、估值（以 daily_quotes 已有的交易日為準）。

回補行情（backfill_history.py）後執行，讓首頁大盤、熱力圖與估值有歷史資料：
  python scripts/backfill_market.py            # 全部已有行情的交易日
  python scripts/backfill_market.py --days 20  # 最近 20 個交易日
"""
import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from loguru import logger
from sqlalchemy import text

from crawlers.fundamental.fundamentals import ValuationCrawler
from crawlers.quote.market_index import MarketIndexCrawler
from crawlers.quote.sector import SectorCrawler
from db.connection import engine, get_session
from monitor.logger import setup_logger
from pipeline.notify import publisher

CRAWLERS = [("大盤指數", MarketIndexCrawler), ("類股指數", SectorCrawler), ("估值", ValuationCrawler)]
# TWSE 限制每 5 秒 3 次請求，放慢以免被封 IP
DELAY_SECONDS = 2.0


async def main() -> None:
    parser = argparse.ArgumentParser(description="補抓大盤/類股/估值")
    parser.add_argument("--days", type=int, default=None, help="只補最近 N 個交易日")
    args = parser.parse_args()
    setup_logger("INFO")

    async with get_session() as session:
        rows = await session.execute(text("SELECT DISTINCT date FROM daily_quotes ORDER BY date DESC"))
        dates = [r[0] for r in rows]
    if args.days:
        dates = dates[: args.days]
    dates.reverse()
    logger.info(f"補抓 {len(dates)} 個交易日：{dates[0] if dates else '-'} ~ {dates[-1] if dates else '-'}")

    failed: list[str] = []
    for d in dates:
        for label, cls in CRAWLERS:
            crawler = cls()
            crawler.set_target_date(d)
            try:
                await crawler.run()
            except Exception as e:  # 單日失敗不中斷其餘日期
                failed.append(f"{d} {label}: {e}")
            await asyncio.sleep(DELAY_SECONDS)

    await publisher.publish_done("market_backfill", count=len(dates))
    await engine.dispose()
    logger.info(f"完成，失敗 {len(failed)} 筆")
    for f in failed:
        logger.warning(f)


if __name__ == "__main__":
    asyncio.run(main())
