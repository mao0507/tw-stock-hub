from datetime import date
from loguru import logger
from crawlers.base.base_crawler import BaseCrawler
from pipeline.cleaner import DataCleaner
from pipeline.writer import DataWriter
from pipeline.notify import publisher


class InstitutionalTPEXCrawler(BaseCrawler):
    crawler_name = "InstitutionalTPEXCrawler"
    referer_url = "https://www.tpex.org.tw/"
    BASE_URL = "https://www.tpex.org.tw/web/stock/3insti/daily_trade/3itrade_hedge_result.php"

    async def crawl(self) -> int:
        today = self.target_date
        tw_date = f"{today.year - 1911}/{today.month:02d}/{today.day:02d}"

        data = await self._fetch_json(
            self.BASE_URL,
            params={"d": tw_date, "se": "EW", "t": "D", "l": "zh-tw"},
        )

        tables = data.get("tables", [])
        rows = tables[0].get("data", []) if tables else []
        if not rows:
            logger.warning(f"[{self.crawler_name}] no records")
            return 0

        records = []
        for row in rows:
            record = self._parse_row(row, today)
            if record:
                records.append(record)

        count = await DataWriter.write_institutional(records)
        await publisher.publish_done(self.crawler_name, today, count)
        logger.info(f"[{self.crawler_name}] {count} records written")
        return count

    def _parse_row(self, row: list, trade_date: date) -> dict | None:
        if len(row) < 24:
            return None

        stock_id = DataCleaner.normalize_stock_id(str(row[0]))
        if not stock_id.isdigit():
            return None

        def to_int(v: str) -> int:
            n = DataCleaner.parse_numeric(v)
            return int(n) if n else 0

        # fields: 0代號 1名稱 [2外資不含自營買 3賣 4買賣超] [5外資自營買 6賣 7買賣超]
        #         [8外資合計買 9賣 10買賣超] [11投信買 12賣 13買賣超]
        #         [14自營自行買 15賣 16買賣超] [17自營避險買 18賣 19買賣超]
        #         [20自營合計買 21賣 22買賣超] 23三大法人合計買賣超
        foreign_buy = to_int(row[8])
        foreign_sell = to_int(row[9])
        trust_buy = to_int(row[11])
        trust_sell = to_int(row[12])
        dealer_buy = to_int(row[20])
        dealer_sell = to_int(row[21])

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
