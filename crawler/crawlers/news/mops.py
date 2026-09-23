import re
from datetime import datetime
from bs4 import BeautifulSoup
from loguru import logger
from crawlers.base.base_news_crawler import BaseNewsCrawler, NewsItem
from db.models import NewsSourceEnum, NewsCategoryEnum

SEQ_NO_RE = re.compile(r"SEQ_NO\.value='(\d+)'")
SPOKE_TIME_RE = re.compile(r"SPOKE_TIME\.value='(\d+)'")
COMPANY_ID_RE = re.compile(r"COMPANY_ID\.value='(\d+)'")


class MOPSNewsCrawler(BaseNewsCrawler):
    crawler_name = "MOPSNewsCrawler"
    referer_url = "https://mopsov.twse.com.tw/mops/web/t05sr01_1"
    LIST_URL = "https://mopsov.twse.com.tw/mops/web/ajax_t05sr01_1"

    CATEGORY_MAP = {
        "財務報告": NewsCategoryEnum.MAJOR,
        "財報": NewsCategoryEnum.MAJOR,
        "董事會": NewsCategoryEnum.MAJOR,
        "法說會": NewsCategoryEnum.ANALYST,
        "停止": NewsCategoryEnum.OFFICIAL,
        "恢復": NewsCategoryEnum.OFFICIAL,
        "變更": NewsCategoryEnum.OFFICIAL,
    }

    async def fetch_news_list(self) -> list[dict]:
        # 這個 ajax 端點只回「今天」清單，沒有日期參數可指定過去日期
        try:
            html = await self._post_text(
                self.LIST_URL,
                data={"encodeURIComponent": "1", "TYPEK": "all", "step": "0"},
                warmup_url=self.referer_url,
            )
        except Exception as e:
            logger.warning(f"[{self.crawler_name}] fetch failed: {e}")
            return []

        soup = BeautifulSoup(html, "lxml")
        rows = []
        for tr in soup.select("table.hasBorder tr"):
            cells = tr.find_all("td")
            if len(cells) < 6:
                continue
            button = cells[5].find("input")
            onclick = button.get("onclick", "") if button else ""
            seq_m = SEQ_NO_RE.search(onclick)
            time_m = SPOKE_TIME_RE.search(onclick)
            id_m = COMPANY_ID_RE.search(onclick)
            rows.append({
                "stock_id": cells[0].get_text(strip=True),
                "company": cells[1].get_text(strip=True),
                "date": cells[2].get_text(strip=True),
                "time": cells[3].get_text(strip=True),
                "title": cells[4].get_text(strip=True),
                "seq_no": seq_m.group(1) if seq_m else "1",
                "company_id": id_m.group(1) if id_m else "",
            })
        return rows

    async def parse_news_item(self, raw: dict) -> NewsItem | None:
        try:
            stock_id = raw["stock_id"]
            company = raw["company"]
            title = raw["title"]
            date_str = raw["date"]

            if not title or not stock_id:
                return None

            from pipeline.cleaner import DataCleaner
            d = DataCleaner.parse_tw_date(date_str)
            if not d:
                return None

            try:
                published_at = datetime.combine(
                    d, datetime.strptime(raw["time"], "%H:%M:%S").time(),
                )
            except ValueError:
                published_at = datetime.combine(d, datetime.min.time())

            company_id = raw["company_id"] or stock_id
            seq_no = raw["seq_no"]
            url = (
                f"https://mopsov.twse.com.tw/mops/web/t05sr01_1?"
                f"COMPANY_ID={company_id}&SEQ_NO={seq_no}&SPOKE_DATE={d.strftime('%Y%m%d')}"
            )

            category = NewsCategoryEnum.MAJOR
            for keyword, cat in self.CATEGORY_MAP.items():
                if keyword in title:
                    category = cat
                    break

            return NewsItem(
                title=f"【{company}】{title}",
                url=url,
                source=NewsSourceEnum.MOPS,
                category=category,
                published_at=published_at,
                is_mops_permanent=True,
                related_stock_ids=[stock_id] if stock_id.isdigit() else [],
            )
        except Exception as e:
            logger.warning(f"[{self.crawler_name}] parse error: {e}, raw={raw}")
            return None
