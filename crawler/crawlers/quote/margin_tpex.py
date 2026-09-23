from datetime import date
from loguru import logger
from crawlers.base.base_crawler import BaseCrawler
from pipeline.cleaner import DataCleaner
from pipeline.writer import DataWriter
from pipeline.notify import publisher


class MarginTradingTPEXCrawler(BaseCrawler):
    crawler_name = "MarginTradingTPEXCrawler"
    referer_url = "https://www.tpex.org.tw/"
    BASE_URL = "https://www.tpex.org.tw/web/stock/margin_trading/margin_balance/margin_bal_result.php"

    async def crawl(self) -> int:
        today = self.target_date
        tw_date = f"{today.year - 1911}/{today.month:02d}/{today.day:02d}"

        data = await self._fetch_json(
            self.BASE_URL,
            params={"d": tw_date, "l": "zh-tw"},
        )

        tables = data.get("tables", [])
        rows = tables[0].get("data", []) if tables else []
        if not rows:
            raise RuntimeError("no records (data not yet published?)")

        records = []
        for row in rows:
            record = self._parse_row(row, today)
            if record:
                records.append(record)

        count = await DataWriter.write_margin(records)
        await publisher.publish_done(self.crawler_name, today, count)
        logger.info(f"[{self.crawler_name}] {count} records written")
        return count

    def _parse_row(self, row: list, trade_date: date) -> dict | None:
        if len(row) < 13:
            return None

        stock_id = DataCleaner.normalize_stock_id(str(row[0]))
        if not stock_id.isdigit():
            return None

        def to_int(v: str) -> int:
            n = DataCleaner.parse_numeric(v)
            return int(n) if n else 0

        margin_prev = to_int(row[2])
        margin_balance = to_int(row[6])
        short_prev = to_int(row[10])
        short_balance = to_int(row[14])

        return {
            "date": trade_date,
            "stock_id": stock_id,
            "margin_balance": margin_balance,
            "margin_change": margin_balance - margin_prev,
            "margin_limit": to_int(row[9]),
            "short_balance": short_balance,
            "short_change": short_balance - short_prev,
            "short_limit": to_int(row[17]),
            "offset": to_int(row[18]) if len(row) > 18 else 0,
        }
