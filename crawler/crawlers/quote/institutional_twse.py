from datetime import date
from loguru import logger
from crawlers.base.base_crawler import BaseCrawler
from pipeline.cleaner import DataCleaner
from pipeline.writer import DataWriter
from pipeline.notify import publisher


class InstitutionalCrawler(BaseCrawler):
    crawler_name = "InstitutionalCrawler"
    referer_url = "https://www.twse.com.tw/"
    BASE_URL = "https://www.twse.com.tw/rwd/zh/fund/T86"

    async def crawl(self) -> int:
        today = self.target_date.strftime("%Y%m%d")
        data = await self._fetch_json(
            self.BASE_URL,
            params={"date": today, "selectType": "ALLBUT0999"},
        )

        if data.get("stat") != "OK":
            raise RuntimeError(f"stat={data.get('stat')} (data not yet published?)")

        records = []
        for row in data.get("data", []):
            record = self._parse_row(row, self.target_date)
            if record:
                records.append(record)

        count = await DataWriter.write_institutional(records)
        await publisher.publish_done(self.crawler_name, self.target_date, count)
        logger.info(f"[{self.crawler_name}] {count} records written")
        return count

    def _parse_row(self, row: list, trade_date: date) -> dict | None:
        if len(row) < 17:
            return None

        stock_id = DataCleaner.normalize_stock_id(str(row[0]))
        if not stock_id.isdigit():
            return None

        def to_int(v: str) -> int:
            n = DataCleaner.parse_numeric(v)
            return int(n) if n else 0

        # fields: 0代號 1名稱 2外陸資買進(不含自營商) 3賣出 4買賣超 5外資自營商買進 6賣出 7買賣超
        #         8投信買進 9賣出 10買賣超 11自營商買賣超 12自營商買進(自行) 13賣出 14買賣超
        #         15自營商買進(避險) 16賣出 17買賣超 18三大法人買賣超
        foreign_buy = to_int(row[2]) + to_int(row[5])
        foreign_sell = to_int(row[3]) + to_int(row[6])
        trust_buy = to_int(row[8])
        trust_sell = to_int(row[9])
        dealer_buy = to_int(row[12]) + to_int(row[15])
        dealer_sell = to_int(row[13]) + to_int(row[16])

        return {
            "date": trade_date,
            "stock_id": stock_id,
            "foreign_buy": foreign_buy,
            "foreign_sell": foreign_sell,
            "foreign_net": foreign_buy - foreign_sell,
            "trust_buy": trust_buy,
            "trust_sell": trust_sell,
            "trust_net": trust_buy - trust_sell,
            "dealer_buy": dealer_buy,
            "dealer_sell": dealer_sell,
            "dealer_net": dealer_buy - dealer_sell,
            "total_net": (foreign_buy - foreign_sell) + (trust_buy - trust_sell) + (dealer_buy - dealer_sell),
        }
