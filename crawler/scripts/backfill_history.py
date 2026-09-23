#!/usr/bin/env python
"""
歷史資料回填腳本（初次部署使用）

使用方式：
  uv run python scripts/backfill_history.py
  uv run python scripts/backfill_history.py --years 1
  uv run python scripts/backfill_history.py --from 2020-01-01 --to 2025-01-01
"""
import argparse
import asyncio
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from loguru import logger
from tqdm import tqdm
from monitor.logger import setup_logger

from crawlers.quote.twse_daily import TWSEDailyQuoteCrawler
from crawlers.quote.tpex_daily import TPEXDailyQuoteCrawler
from crawlers.quote.institutional_twse import InstitutionalCrawler
from crawlers.quote.institutional_tpex import InstitutionalTPEXCrawler
from crawlers.quote.margin_twse import MarginTradingCrawler
from crawlers.quote.margin_tpex import MarginTradingTPEXCrawler

CRAWLERS_ORDER = [
    ("上市行情", TWSEDailyQuoteCrawler),
    ("上櫃行情", TPEXDailyQuoteCrawler),
    ("上市三大法人", InstitutionalCrawler),
    ("上櫃三大法人", InstitutionalTPEXCrawler),
    ("上市融資融券", MarginTradingCrawler),
    ("上櫃融資融券", MarginTradingTPEXCrawler),
]


def is_trading_day(d: date) -> bool:
    return d.weekday() < 5


def get_trading_days(start: date, end: date) -> list[date]:
    days = []
    cur = start
    while cur <= end:
        if is_trading_day(cur):
            days.append(cur)
        cur += timedelta(days=1)
    return days


async def run_one_day(crawler_class, target_date: date) -> bool:
    crawler = crawler_class()
    if hasattr(crawler, "set_target_date"):
        crawler.set_target_date(target_date)
    try:
        await crawler.crawl()
        return True
    except Exception as e:
        logger.warning(f"  ✗ {target_date} {crawler_class.__name__}: {e}")
        return False


async def main() -> None:
    parser = argparse.ArgumentParser(description="歷史資料回填")
    parser.add_argument("--years", type=int, default=2, help="回填年數（預設 2 年）")
    parser.add_argument("--from", dest="from_date", help="起始日期（YYYY-MM-DD）")
    parser.add_argument("--to", dest="to_date", help="結束日期（YYYY-MM-DD）")
    args = parser.parse_args()

    setup_logger("INFO")

    today = date.today()
    if args.from_date and args.to_date:
        start = date.fromisoformat(args.from_date)
        end = date.fromisoformat(args.to_date)
    else:
        start = date(today.year - args.years, today.month, today.day)
        end = today

    trading_days = get_trading_days(start, end)
    total = len(trading_days)

    logger.info(f"回填期間：{start} ~ {end}，共 {total} 個交易日")
    logger.info("注意：此腳本約需 30~60 分鐘，請確認資料庫連線正常")
    if sys.stdin.isatty():
        print("按 Enter 開始，Ctrl+C 取消...")
        input()
    else:
        logger.info("非互動環境（如背景執行），略過確認直接開始")

    stats: dict[str, dict[str, int]] = {
        name: {"success": 0, "failed": 0}
        for name, _ in CRAWLERS_ORDER
    }

    with tqdm(total=total, desc="回填進度", unit="日") as pbar:
        for d in trading_days:
            pbar.set_postfix(date=str(d))

            for name, crawler_class in CRAWLERS_ORDER:
                ok = await run_one_day(crawler_class, d)
                if ok:
                    stats[name]["success"] += 1
                else:
                    stats[name]["failed"] += 1
                await asyncio.sleep(1.5)

            pbar.update(1)

    print("\n" + "=" * 50)
    print("回填統計報告")
    print("=" * 50)
    for name, stat in stats.items():
        total_attempts = stat["success"] + stat["failed"]
        success_rate = stat["success"] / total_attempts * 100 if total_attempts else 0
        print(f"{name:15} 成功: {stat['success']:4d}  失敗: {stat['failed']:4d}  成功率: {success_rate:.1f}%")
    print("=" * 50)
    print("回填完成！")


if __name__ == "__main__":
    asyncio.run(main())
