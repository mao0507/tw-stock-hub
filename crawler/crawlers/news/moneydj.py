import re
from datetime import datetime
from bs4 import BeautifulSoup
from loguru import logger
from crawlers.base.base_news_crawler import BaseNewsCrawler, NewsItem
from db.models import NewsSourceEnum, NewsCategoryEnum

DATE_RE = re.compile(r"(\d{2})/(\d{2})\s+(\d{2}):(\d{2})")


class MoneyDJNewsCrawler(BaseNewsCrawler):
    """MoneyDJ 台股新聞爬蟲。盤後 14:00 執行一次。"""

    crawler_name = "MoneyDJNewsCrawler"
    referer_url = "https://www.moneydj.com/"
    BASE_URL = "https://www.moneydj.com/KMDJ/News/NewsSubjectList.aspx"

    async def fetch_news_list(self) -> list[dict]:
        try:
            html = await self._fetch_text(self.BASE_URL, params={"a": "X0200001"})
        except Exception as e:
            logger.warning(f"[{self.crawler_name}] fetch failed: {e}")
            return []

        soup = BeautifulSoup(html, "lxml")
        rows = []
        for link in soup.select("a[href*='newsviewer.aspx']"):
            row = link.find_parent("tr")
            if not row:
                continue
            date_cell = row.find("td")
            date_str = date_cell.get_text(strip=True) if date_cell else ""
            title = link.get("title") or link.get_text(strip=True)
            href = link.get("href", "")
            url = f"https://www.moneydj.com{href}" if href.startswith("/") else href
            rows.append({"title": title, "url": url, "date_str": date_str})
        return rows

    async def parse_news_item(self, raw: dict) -> NewsItem | None:
        try:
            title = raw["title"]
            url = raw["url"]
            if not title or not url:
                return None

            m = DATE_RE.search(raw.get("date_str", ""))
            if m:
                month, day, hour, minute = (int(g) for g in m.groups())
                year = self.target_date.year
                if month > self.target_date.month:
                    year -= 1
                published_at = datetime(year, month, day, hour, minute)
            else:
                published_at = datetime.combine(self.target_date, datetime.min.time())

            return NewsItem(
                title=title,
                url=url,
                source=NewsSourceEnum.MONEYDJ,
                category=NewsCategoryEnum.MARKET,
                published_at=published_at,
            )
        except Exception as e:
            logger.warning(f"[{self.crawler_name}] parse error: {e}, raw={raw}")
            return None
