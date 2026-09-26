#!/usr/bin/env python
"""
補爬指定日期的資料

使用方式：
  uv run python scripts/backfill.py --crawler twse_daily --date 2025-01-15
  uv run python scripts/backfill.py --crawler institutional_twse --from 2025-01-01 --to 2025-01-31
  uv run python scripts/backfill.py --crawler twse_daily --date 2025-01-15 --force
"""
import argparse
import asyncio
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from loguru import logger
from monitor.logger import setup_logger
from config import settings

CRAWLER_MAP = {
    "market_index": ("crawlers.quote.market_index", "MarketIndexCrawler"),
    "twse_daily": ("crawlers.quote.twse_daily", "TWSEDailyQuoteCrawler"),
    "tpex_daily": ("crawlers.quote.tpex_daily", "TPEXDailyQuoteCrawler"),
    "institutional_twse": ("crawlers.quote.institutional_twse", "InstitutionalCrawler"),
    "institutional_tpex": ("crawlers.quote.institutional_tpex", "InstitutionalTPEXCrawler"),
    "margin_twse": ("crawlers.quote.margin_twse", "MarginTradingCrawler"),
    "margin_tpex": ("crawlers.quote.margin_tpex", "MarginTradingTPEXCrawler"),
    "sector": ("crawlers.quote.sector", "SectorCrawler"),
    "broker": ("crawlers.quote.broker", "BrokerCrawler"),
    "revenue": ("crawlers.fundamental.fundamentals", "MonthlyRevenueCrawler"),
    "financials": ("crawlers.fundamental.fundamentals", "FinancialStatementCrawler"),
    "dividend": ("crawlers.fundamental.fundamentals", "DividendCrawler"),
    "valuation": ("crawlers.fundamental.valuation", "ValuationCrawler"),
    "valuation_tpex": ("crawlers.fundamental.valuation", "ValuationTPEXCrawler"),
    "exdividend": ("crawlers.fundamental.fundamentals", "ExDividendCalendarCrawler"),
    "holders": ("crawlers.fundamental.fundamentals", "ShareholderDispersionCrawler"),
    "mops": ("crawlers.news.mops", "MOPSNewsCrawler"),
}


def get_crawler_class(name: str):
    if name not in CRAWLER_MAP:
        raise ValueError(f"Unknown crawler: {name}. Available: {list(CRAWLER_MAP.keys())}")
    module_path, class_name = CRAWLER_MAP[name]
    import importlib
    module = importlib.import_module(module_path)
    return getattr(module, class_name)


def is_trading_day(d: date) -> bool:
    return d.weekday() < 5


def date_range(start: date, end: date) -> list[date]:
    dates = []
    current = start
    while current <= end:
        if is_trading_day(current):
            dates.append(current)
        current += timedelta(days=1)
    return dates


async def backfill_single(crawler_class, target_date: date, force: bool = False) -> bool:
    crawler = crawler_class()
    if hasattr(crawler, "set_target_date"):
        crawler.set_target_date(target_date)
    try:
        count = await crawler.run()
        logger.success(f"  ✓ {target_date} → {count} records")
        return True
    except Exception as e:
        logger.error(f"  ✗ {target_date} → {e}")
        return False


async def main() -> None:
    parser = argparse.ArgumentParser(description="台股資料補爬工具")
    parser.add_argument("--crawler", required=True, help="爬蟲名稱")
    parser.add_argument("--date", help="單一日期（YYYY-MM-DD）")
    parser.add_argument("--from", dest="from_date", help="起始日期（YYYY-MM-DD）")
    parser.add_argument("--to", dest="to_date", help="結束日期（YYYY-MM-DD）")
    parser.add_argument("--force", action="store_true", help="強制覆蓋已有資料")
    args = parser.parse_args()

    setup_logger(settings.log_level)

    try:
        crawler_class = get_crawler_class(args.crawler)
    except ValueError as e:
        logger.error(str(e))
        sys.exit(1)

    if args.date:
        dates = [date.fromisoformat(args.date)]
    elif args.from_date and args.to_date:
        dates = date_range(
            date.fromisoformat(args.from_date),
            date.fromisoformat(args.to_date),
        )
    else:
        logger.error("需提供 --date 或 --from + --to")
        sys.exit(1)

    logger.info(f"補爬 {args.crawler}，共 {len(dates)} 個交易日")
    if args.force:
        logger.warning("--force 模式：將覆蓋已有資料")

    success = 0
    failed = 0

    for d in dates:
        ok = await backfill_single(crawler_class, d, args.force)
        if ok:
            success += 1
        else:
            failed += 1
        await asyncio.sleep(2)

    logger.info(f"完成：成功 {success}，失敗 {failed}")


if __name__ == "__main__":
    asyncio.run(main())
