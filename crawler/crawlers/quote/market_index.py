import re
from crawlers.base.base_crawler import BaseCrawler
from pipeline.cleaner import DataCleaner
from pipeline.writer import DataWriter
from pipeline.notify import publisher


class MarketIndexCrawler(BaseCrawler):
    crawler_name = "MarketIndexCrawler"
    referer_url = "https://www.twse.com.tw/"

    async def crawl(self) -> int:
        today = self.target_date.strftime("%Y%m%d")

        fmtqik = await self._fetch_json(
            "https://www.twse.com.tw/rwd/zh/afterTrading/FMTQIK",
            params={"date": today, "response": "json"},
        )
        if fmtqik.get("stat") != "OK":
            raise RuntimeError(f"FMTQIK stat not OK: {fmtqik.get('stat')}")

        record = self._parse_fmtqik_row(fmtqik.get("data", []))
        if not record:
            raise RuntimeError(f"TAIEX row not found for {today} (data not yet published?)")

        ms = await self._fetch_json(
            "https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX",
            params={"date": today, "type": "MS"},
        )
        record.update(self._parse_counts(ms.get("tables", [])))

        ohlc = await self._fetch_ohlc(today)
        record.update(ohlc)

        count = await DataWriter.write_market_index([record])
        await publisher.publish_done(self.crawler_name, self.target_date, count)
        return count

    async def _fetch_ohlc(self, today: str) -> dict:
        # row[0]=09:00:00 is reference price (= prev_close); row[1]=09:00:05 is actual open
        data = await self._fetch_json(
            "https://www.twse.com.tw/exchangeReport/MI_5MINS_INDEX",
            params={"date": today, "response": "json"},
        )
        rows = data.get("data", [])
        if len(rows) < 2:
            return {"taiex_open": None, "taiex_high": None, "taiex_low": None, "taiex_prev_close": None}

        def pv(s: str) -> float | None:
            try:
                return float(s.replace(",", ""))
            except (ValueError, AttributeError):
                return None

        prev_close = pv(rows[0][1])
        open_val = pv(rows[1][1])
        trading_vals = [v for r in rows[1:] if (v := pv(r[1])) is not None]

        return {
            "taiex_prev_close": prev_close,
            "taiex_open": open_val,
            "taiex_high": max(trading_vals) if trading_vals else None,
            "taiex_low": min(trading_vals) if trading_vals else None,
        }

    def _parse_fmtqik_row(self, rows: list) -> dict | None:
        roc_date = f"{self.target_date.year - 1911}/{self.target_date.month:02d}/{self.target_date.day:02d}"
        for row in rows:
            if len(row) >= 6 and row[0] == roc_date:
                close = DataCleaner.parse_numeric(row[4])
                change = DataCleaner.parse_change(row[5])
                prev_close = close - change if close is not None and change is not None else None
                change_pct = (
                    round(change / prev_close * 100, 2)
                    if change and prev_close
                    else None
                )
                return {
                    "date": self.target_date,
                    "taiex_close": close,
                    "taiex_change": change,
                    "taiex_change_pct": change_pct,
                    "total_volume": int(DataCleaner.parse_numeric(row[1]) or 0),
                    "total_value": int(DataCleaner.parse_numeric(row[2]) or 0),
                }
        return None

    def _parse_counts(self, tables: list) -> dict:
        for table in tables:
            if table.get("fields") and "整體市場" in table["fields"]:
                counts = {}
                for row in table.get("data", []):
                    label, value = row[0], row[1]
                    n = int(re.sub(r"\(.*\)", "", value).replace(",", "") or 0)
                    if "上漲" in label:
                        counts["up_count"] = n
                        m = re.search(r"\((\d+)\)", value)
                        counts["limit_up_count"] = int(m.group(1)) if m else 0
                    elif "下跌" in label:
                        counts["down_count"] = n
                        m = re.search(r"\((\d+)\)", value)
                        counts["limit_down_count"] = int(m.group(1)) if m else 0
                    elif "持平" in label:
                        counts["flat_count"] = n
                if counts:
                    return {
                        "up_count": counts.get("up_count", 0),
                        "down_count": counts.get("down_count", 0),
                        "flat_count": counts.get("flat_count", 0),
                        "limit_up_count": counts.get("limit_up_count", 0),
                        "limit_down_count": counts.get("limit_down_count", 0),
                    }
        return {
            "up_count": 0, "down_count": 0, "flat_count": 0,
            "limit_up_count": 0, "limit_down_count": 0,
        }
