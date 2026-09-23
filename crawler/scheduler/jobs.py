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
    ValuationCrawler, ExDividendCalendarCrawler, ShareholderDispersionCrawler,
)
from crawlers.fundamental.etf import refresh_all_known_etfs
from crawlers.news.mops import MOPSNewsCrawler
from crawlers.news.cnyes import CnyesNewsCrawler
from crawlers.news.yahoo import YahooFinanceNewsCrawler
from crawlers.news.moneydj import MoneyDJNewsCrawler
from crawlers.news.twse_announcement import TWSeAnnouncementCrawler

JobFn = Callable[[], Awaitable[int | None]]


def _crawler(cls: type) -> JobFn:
    return lambda: cls().run()


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
