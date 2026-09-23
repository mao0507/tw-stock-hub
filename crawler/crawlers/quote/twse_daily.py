import re
from datetime import date
from loguru import logger
from crawlers.base.base_crawler import BaseCrawler
from pipeline.cleaner import DataCleaner
from pipeline.validator import DataValidator
from pipeline.writer import DataWriter
from pipeline.notify import publisher


class TWSEDailyQuoteCrawler(BaseCrawler):
    crawler_name = "TWSEDailyQuoteCrawler"
    referer_url = "https://www.twse.com.tw/"
    BASE_URL = "https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX"
    SKIP_KEYWORDS = ["合計", "小計", "ETF", "指數", "基金"]

    async def crawl(self) -> int:
        today = self.target_date.strftime("%Y%m%d")
        data = await self._fetch_json(
            self.BASE_URL,
            params={"date": today, "type": "ALLBUT0999"},
        )

        if data.get("stat") != "OK":
            logger.warning(f"[{self.crawler_name}] stat={data.get('stat')}")
            return 0

        records = []
        stocks_to_upsert = []

        for table in data.get("tables", []):
            for row in table.get("data", []):
                record = self._parse_row(row, self.target_date)
                if record:
                    stock_name = record.pop("_stock_name")
                    records.append(record)
                    stocks_to_upsert.append({
                        "id": record["stock_id"],
                        "name": stock_name,
                        "market": "TWSE",
                        "is_active": True,
                    })

        count = await DataWriter.write_daily_quotes(records)
        if stocks_to_upsert:
            await DataWriter.upsert_stocks(stocks_to_upsert)

        await publisher.publish_done(self.crawler_name, self.target_date, count)
        logger.info(f"[{self.crawler_name}] {count} quotes written")
        return count

    def _parse_row(self, row: list, trade_date: date) -> dict | None:
        if len(row) < 11:
            return None

        stock_id = DataCleaner.normalize_stock_id(str(row[0]))
        stock_name = str(row[1]).strip()

        if not stock_id.isdigit():
            return None
        for kw in self.SKIP_KEYWORDS:
            if kw in stock_name:
                return None

        open_ = DataCleaner.parse_numeric(row[5])
        high = DataCleaner.parse_numeric(row[6])
        low = DataCleaner.parse_numeric(row[7])
        close = DataCleaner.parse_numeric(row[8])
        volume_raw = DataCleaner.parse_numeric(row[2])

        if any(v is None for v in [open_, high, low, close]):
            return None
        if not DataValidator.validate_quote(
            {"open": open_, "high": high, "low": low, "close": close, "volume": 1},
            stock_id=stock_id,
        ):
            return None

        # row[9] 為漲跌符號欄，TWSE 以 HTML 顏色表示（下跌 green、上漲 red）
        sign = str(row[9])
        is_down = "green" in sign.lower() or "-" in re.sub(r"<[^>]+>", "", sign)
        change_val = DataCleaner.parse_change(row[10])
        if change_val is not None and is_down:
            change_val = -abs(change_val)

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
            "value": int(DataCleaner.parse_numeric(row[4]) or 0),
            "change": change_val,
            "change_pct": round(float(change_pct), 2) if change_pct else None,
            "transaction_count": int(DataCleaner.parse_numeric(row[3]) or 0),
            "_stock_name": stock_name,
        }
