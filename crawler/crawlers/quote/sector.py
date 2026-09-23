from datetime import date
from loguru import logger
from crawlers.base.base_crawler import BaseCrawler
from pipeline.cleaner import DataCleaner
from pipeline.writer import DataWriter
from pipeline.notify import publisher


class SectorCrawler(BaseCrawler):
    crawler_name = "SectorCrawler"
    referer_url = "https://www.twse.com.tw/"
    BASE_URL = "https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX"

    async def crawl(self) -> int:
        today = self.target_date.strftime("%Y%m%d")
        data = await self._fetch_json(
            self.BASE_URL,
            params={"date": today, "type": "IND"},
        )

        if data.get("stat") != "OK":
            logger.warning(f"[{self.crawler_name}] stat={data.get('stat')}")
            return 0

        records = []
        for table in data.get("tables", []):
            for row in table.get("data", []):
                record = self._parse_row(row, self.target_date)
                if record:
                    records.append(record)

        count = await DataWriter.write_sector(records)
        await publisher.publish_done(self.crawler_name, self.target_date, count)
        logger.info(f"[{self.crawler_name}] {count} records written")
        return count

    def _parse_row(self, row: list, trade_date: date) -> dict | None:
        if len(row) < 5:
            return None

        sector_name = str(row[0]).strip()
        if not sector_name or sector_name in ["類股名稱", "指數", "－"]:
            return None

        index_value = DataCleaner.parse_numeric(row[1])
        change = DataCleaner.parse_numeric(row[3])
        if index_value is None or change is None:
            return None
        if "green" in str(row[2]):
            change = -abs(change)

        return {
            "date": trade_date,
            "sector_name": sector_name,
            "index_value": index_value,
            "change": change,
            "change_pct": DataCleaner.parse_change(row[4]),
            "volume": 0,
            "value": 0,
        }
