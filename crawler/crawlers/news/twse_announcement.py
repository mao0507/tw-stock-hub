from datetime import datetime
from loguru import logger
from crawlers.base.base_news_crawler import BaseNewsCrawler, NewsItem
from db.models import NewsSourceEnum, NewsCategoryEnum


def _parse_roc_datetime(date_str: str, time_str: str) -> datetime | None:
    try:
        year = int(date_str[:3]) + 1911
        month = int(date_str[3:5])
        day = int(date_str[5:7])
        hour = int(time_str[:2])
        minute = int(time_str[2:4])
        second = int(time_str[4:6])
        return datetime(year, month, day, hour, minute, second)
    except (ValueError, IndexError):
        return None


class TWSeAnnouncementCrawler(BaseNewsCrawler):
    """證交所暫停交易公告爬蟲。盤後 14:00 執行一次。"""

    crawler_name = "TWSeAnnouncementCrawler"
    referer_url = "https://www.twse.com.tw/"
    BASE_URL = "https://openapi.twse.com.tw/v1/exchangeReport/TWTAWU"

    async def fetch_news_list(self) -> list[dict]:
        try:
            data = await self._fetch_json(self.BASE_URL)
        except Exception as e:
            logger.warning(f"[{self.crawler_name}] fetch failed: {e}")
            return []
        return data if isinstance(data, list) else []

    async def parse_news_item(self, raw: dict) -> NewsItem | None:
        try:
            stock_id = str(raw.get("Code", "")).strip()
            name = str(raw.get("Name", "")).strip()
            halt_date = str(raw.get("TradingHaltDate", "")).strip()
            halt_time = str(raw.get("TradingHaltTime", "")).strip()
            resume_date = str(raw.get("TradingResumptionDate", "")).strip()

            if not stock_id or not halt_date:
                return None

            published_at = _parse_roc_datetime(halt_date, halt_time or "000000")
            if not published_at:
                return None

            title = f"【{name}】暫停交易，預定復牌日：{resume_date}"
            url = f"https://openapi.twse.com.tw/v1/exchangeReport/TWTAWU#{stock_id}-{halt_date}"

            return NewsItem(
                title=title,
                url=url,
                source=NewsSourceEnum.TWSE,
                category=NewsCategoryEnum.OFFICIAL,
                published_at=published_at,
                related_stock_ids=[stock_id] if stock_id.isdigit() else [],
            )
        except Exception as e:
            logger.warning(f"[{self.crawler_name}] parse error: {e}, raw={raw}")
            return None
