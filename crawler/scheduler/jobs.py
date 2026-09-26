"""任務註冊表：job 名稱 → 執行函式。排程時間寫在 crawler/crontab。"""

from collections.abc import Awaitable, Callable

from crawlers.quote.market_index import MarketIndexCrawler
from crawlers.quote.twse_daily import TWSEDailyQuoteCrawler
from crawlers.quote.tpex_daily import TPEXDailyQuoteCrawler
from crawlers.quote.institutional_twse import InstitutionalCrawler
from crawlers.quote.institutional_tpex import InstitutionalTPEXCrawler
from crawlers.quote.margin_twse import MarginTradingCrawler
from crawlers.quote.margin_tpex import MarginTradingTPEXCrawler
from crawlers.quote.sector import SectorCrawler
from crawlers.quote.broker import BrokerCrawler
from crawlers.fundamental.fundamentals import (
    MonthlyRevenueCrawler, FinancialStatementCrawler, DividendCrawler,
    ExDividendCalendarCrawler, ShareholderDispersionCrawler,
)
from crawlers.fundamental.valuation import ValuationCrawler, ValuationTPEXCrawler
from crawlers.fundamental.etf import refresh_all_known_etfs
from crawlers.news.mops import MOPSNewsCrawler
from crawlers.news.cnyes import CnyesNewsCrawler
from crawlers.news.yahoo import YahooFinanceNewsCrawler
from crawlers.news.moneydj import MoneyDJNewsCrawler
from crawlers.news.twse_announcement import TWSeAnnouncementCrawler

JobFn = Callable[[], Awaitable[int | None]]


def _crawler(cls: type) -> JobFn:
    job = lambda: cls().run()  # noqa: E731
    # 與 crawler_logs.crawler_name 一致（BaseCrawler 子類別的 crawler_name 屬性）
    job.crawler_class = getattr(cls, "crawler_name", cls.__name__)  # type: ignore[attr-defined]
    return job


JOBS: dict[str, JobFn] = {
    "market_index": _crawler(MarketIndexCrawler),
    "twse_daily": _crawler(TWSEDailyQuoteCrawler),
    "tpex_daily": _crawler(TPEXDailyQuoteCrawler),
    "institutional_twse": _crawler(InstitutionalCrawler),
    "institutional_tpex": _crawler(InstitutionalTPEXCrawler),
    "margin_twse": _crawler(MarginTradingCrawler),
    "margin_tpex": _crawler(MarginTradingTPEXCrawler),
    "sector": _crawler(SectorCrawler),
    "broker": _crawler(BrokerCrawler),
    "valuation": _crawler(ValuationCrawler),
    "valuation_tpex": _crawler(ValuationTPEXCrawler),
    "exdividend": _crawler(ExDividendCalendarCrawler),
    "revenue": _crawler(MonthlyRevenueCrawler),
    "financials": _crawler(FinancialStatementCrawler),
    "dividend": _crawler(DividendCrawler),
    "holders": _crawler(ShareholderDispersionCrawler),
    "etf_refresh": refresh_all_known_etfs,
    "mops": _crawler(MOPSNewsCrawler),
    "cnyes": _crawler(CnyesNewsCrawler),
    "yahoo": _crawler(YahooFinanceNewsCrawler),
    "moneydj": _crawler(MoneyDJNewsCrawler),
    "twse_announcement": _crawler(TWSeAnnouncementCrawler),
}


# 爬蟲類別名稱（crawler_logs.crawler_name）→ 任務名稱；admin 以類別名稱觸發時用
JOB_BY_CRAWLER: dict[str, str] = {
    fn.crawler_class: name for name, fn in JOBS.items() if hasattr(fn, "crawler_class")
}


def resolve_job(name: str) -> str | None:
    """接受任務名稱或爬蟲類別名稱，回傳任務名稱；都不是則 None。"""
    if name in JOBS:
        return name
    return JOB_BY_CRAWLER.get(name)
