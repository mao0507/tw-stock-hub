from datetime import date
from loguru import logger
from crawlers.base.base_crawler import BaseCrawler
from pipeline.cleaner import DataCleaner
from pipeline.validator import DataValidator
from pipeline.writer import DataWriter
from pipeline.notify import publisher


class TPEXDailyQuoteCrawler(BaseCrawler):
    crawler_name = "TPEXDailyQuoteCrawler"
    referer_url = "https://www.tpex.org.tw/"
    BASE_URL = "https://www.tpex.org.tw/web/stock/aftertrading/otc_quotes_no1430/stk_wn1430_result.php"
    SKIP_KEYWORDS = ["合計", "小計", "ETF", "指數", "基金"]

    async def crawl(self) -> int:
        today = self.target_date
        tw_date = f"{today.year - 1911}/{today.month:02d}/{today.day:02d}"

        data = await self._fetch_json(
            self.BASE_URL,
            params={"d": tw_date, "se": "EW", "l": "zh-tw"},
        )

        tables = data.get("tables", [])
        rows = tables[0].get("data", []) if tables else []
        if not rows:
            logger.warning(f"[{self.crawler_name}] no records")
            return 0

        records = []
        stocks_to_upsert = []

        for row in rows:
            record = self._parse_row(row, today)
            if record:
                stock_name = record.pop("_stock_name")
                records.append(record)
                stocks_to_upsert.append({
                    "id": record["stock_id"],
                    "name": stock_name,
                    "market": "TPEX",
                    "is_active": True,
                })

        count = await DataWriter.write_daily_quotes(records)
        if stocks_to_upsert:
            await DataWriter.upsert_stocks(stocks_to_upsert)

        await publisher.publish_done(self.crawler_name, today, count)
        logger.info(f"[{self.crawler_name}] {count} quotes written")
        return count

    def _parse_row(self, row: list, trade_date: date) -> dict | None:
        if len(row) < 9:
            return None

        stock_id = DataCleaner.normalize_stock_id(str(row[0]))
        stock_name = str(row[1]).strip()

        if not stock_id.isdigit():
            return None
        for kw in self.SKIP_KEYWORDS:
            if kw in stock_name:
                return None

        close = DataCleaner.parse_numeric(row[2])
        change_val = DataCleaner.parse_change(row[3])
        open_ = DataCleaner.parse_numeric(row[4])
        high = DataCleaner.parse_numeric(row[5])
        low = DataCleaner.parse_numeric(row[6])
        volume_raw = DataCleaner.parse_numeric(row[7])

        if any(v is None for v in [open_, high, low, close]):
            return None
        if not DataValidator.validate_quote(
            {"open": open_, "high": high, "low": low, "close": close, "volume": 1},
            stock_id=stock_id,
        ):
            return None

        prev_close = close - (change_val or 0)
        change_pct = (change_val / prev_close * 100) if prev_close and change_val else None

        return {
            "date": trade_date,
            "stock_id": stock_id,
            "open": open_,
            "high": high,
            "low": low,
            "close": close,
            "volume": int(volume_raw or 0),
            "value": int(DataCleaner.parse_numeric(row[8]) or 0) if len(row) > 8 else 0,
            "change": change_val,
            "change_pct": round(float(change_pct), 2) if change_pct else None,
            "transaction_count": int(DataCleaner.parse_numeric(row[9]) or 0) if len(row) > 9 else 0,
            "_stock_name": stock_name,
        }
