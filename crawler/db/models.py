import enum
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger, Boolean, Column, Date, DateTime,
    Enum, Integer, Numeric, String, Text, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.sql import func


class Base(DeclarativeBase):
    pass


class MarketEnum(str, enum.Enum):
    TWSE = "TWSE"
    TPEX = "TPEX"


class NewsSourceEnum(str, enum.Enum):
    MOPS = "mops"
    CNYES = "cnyes"
    YAHOO = "yahoo"
    MONEYDJ = "moneydj"
    TWSE = "twse"


class NewsCategoryEnum(str, enum.Enum):
    MAJOR = "major_announcement"
    MARKET = "market_news"
    ANALYST = "analyst"
    OFFICIAL = "official"


class CrawlerStatusEnum(str, enum.Enum):
    SUCCESS = "success"
    FAILED = "failed"
    PARTIAL = "partial"


class StockModel(Base):
    __tablename__ = "stocks"

    id = Column(String(10), primary_key=True)
    name = Column(String(50), nullable=False)
    market = Column(Enum(MarketEnum, name="market_enum", values_callable=lambda e: [m.value for m in e]), nullable=False)
    sector = Column(String(50), nullable=True)
    listing_date = Column(Date, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class DailyQuoteModel(Base):
    __tablename__ = "daily_quotes"
    __table_args__ = (
        UniqueConstraint("stock_id", "date", name="uq_daily_quotes_stock_date"),
    )

    date = Column(Date, primary_key=True)
    stock_id = Column(String(10), primary_key=True)
    open = Column(Numeric(12, 2), nullable=False)
    high = Column(Numeric(12, 2), nullable=False)
    low = Column(Numeric(12, 2), nullable=False)
    close = Column(Numeric(12, 2), nullable=False)
    volume = Column(BigInteger, nullable=False)
    value = Column(BigInteger, nullable=False)
    change = Column(Numeric(8, 2), nullable=True)
    change_pct = Column(Numeric(8, 2), nullable=True)
    transaction_count = Column(Integer, nullable=True)


class MarketIndexModel(Base):
    __tablename__ = "market_index"

    date = Column(Date, primary_key=True)
    taiex_close = Column(Numeric(12, 2), nullable=False)
    taiex_change = Column(Numeric(10, 2), nullable=False)
    taiex_change_pct = Column(Numeric(8, 2), nullable=False)
    total_volume = Column(BigInteger, nullable=False)
    total_value = Column(BigInteger, nullable=False)
    up_count = Column(Integer, nullable=False)
    down_count = Column(Integer, nullable=False)
    flat_count = Column(Integer, nullable=False)
    limit_up_count = Column(Integer, nullable=False)
    limit_down_count = Column(Integer, nullable=False)
    taiex_open = Column(Numeric(12, 2), nullable=True)
    taiex_high = Column(Numeric(12, 2), nullable=True)
    taiex_low = Column(Numeric(12, 2), nullable=True)
    taiex_prev_close = Column(Numeric(12, 2), nullable=True)


class InstitutionalTradingModel(Base):
    __tablename__ = "institutional_trading"
    __table_args__ = (
        UniqueConstraint("stock_id", "date", name="uq_inst_stock_date"),
    )

    date = Column(Date, primary_key=True)
    stock_id = Column(String(10), primary_key=True)
    foreign_buy = Column(BigInteger, nullable=False)
    foreign_sell = Column(BigInteger, nullable=False)
    foreign_net = Column(BigInteger, nullable=False)
    trust_buy = Column(BigInteger, nullable=False)
    trust_sell = Column(BigInteger, nullable=False)
    trust_net = Column(BigInteger, nullable=False)
    dealer_buy = Column(BigInteger, nullable=False)
    dealer_sell = Column(BigInteger, nullable=False)
    dealer_net = Column(BigInteger, nullable=False)
    total_net = Column(BigInteger, nullable=False)


class MarginTradingModel(Base):
    __tablename__ = "margin_trading"
    __table_args__ = (
        UniqueConstraint("stock_id", "date", name="uq_margin_stock_date"),
    )

    date = Column(Date, primary_key=True)
    stock_id = Column(String(10), primary_key=True)
    margin_balance = Column(BigInteger, nullable=False)
    margin_change = Column(BigInteger, nullable=False)
    margin_limit = Column(BigInteger, nullable=False)
    short_balance = Column(BigInteger, nullable=False)
    short_change = Column(BigInteger, nullable=False)
    short_limit = Column(BigInteger, nullable=False)
    offset = Column(BigInteger, nullable=True)


class SectorPerformanceModel(Base):
    __tablename__ = "sector_performance"
    __table_args__ = (
        UniqueConstraint("sector_name", "date", name="uq_sector_date"),
    )

    date = Column(Date, primary_key=True)
    sector_name = Column(String(50), primary_key=True)
    index_value = Column(Numeric(12, 2), nullable=False)
    change = Column(Numeric(10, 2), nullable=False)
    change_pct = Column(Numeric(8, 2), nullable=False)
    volume = Column(BigInteger, nullable=True)
    value = Column(BigInteger, nullable=True)


class BrokerTradingModel(Base):
    __tablename__ = "broker_trading"
    __table_args__ = (
        UniqueConstraint("date", "stock_id", "broker_name", name="uq_broker_date_stock_name"),
    )

    date = Column(Date, primary_key=True)
    stock_id = Column(String(10), primary_key=True)
    broker_name = Column(String(60), primary_key=True)
    buy = Column(BigInteger, nullable=False, default=0)
    sell = Column(BigInteger, nullable=False, default=0)
    net = Column(BigInteger, nullable=False, default=0)


class BrokerTradingDetailModel(Base):
    __tablename__ = "broker_trading_detail"
    __table_args__ = (
        UniqueConstraint(
            "date", "stock_id", "broker_name", "price",
            name="uq_broker_detail_date_stock_name_price",
        ),
    )

    date = Column(Date, primary_key=True)
    stock_id = Column(String(10), primary_key=True)
    broker_name = Column(String(60), primary_key=True)
    price = Column(Numeric(12, 2), primary_key=True)
    buy = Column(BigInteger, nullable=False, default=0)
    sell = Column(BigInteger, nullable=False, default=0)


class MonthlyRevenueModel(Base):
    __tablename__ = "monthly_revenue"
    __table_args__ = (UniqueConstraint("stock_id", "year_month", name="uq_revenue"),)
    stock_id = Column(String(10), primary_key=True)
    year_month = Column(String(6), primary_key=True)
    revenue = Column(BigInteger)
    mom_pct = Column(Numeric(10, 2))
    yoy_pct = Column(Numeric(10, 2))
    cum_revenue = Column(BigInteger)
    cum_yoy_pct = Column(Numeric(10, 2))


class FinancialStatementModel(Base):
    __tablename__ = "financial_statements"
    __table_args__ = (UniqueConstraint("stock_id", "year", "quarter", name="uq_fin"),)
    stock_id = Column(String(10), primary_key=True)
    year = Column(Integer, primary_key=True)
    quarter = Column(Integer, primary_key=True)
    revenue = Column(BigInteger)
    gross_profit = Column(BigInteger)
    op_income = Column(BigInteger)
    pretax_income = Column(BigInteger)
    net_income = Column(BigInteger)
    eps = Column(Numeric(8, 2))
    cost_of_goods_sold = Column(BigInteger)
    op_expenses = Column(BigInteger)
    non_op_income = Column(BigInteger)


class BalanceSheetModel(Base):
    __tablename__ = "balance_sheets"
    __table_args__ = (UniqueConstraint("stock_id", "year", "quarter", name="uq_bs"),)
    stock_id = Column(String(10), primary_key=True)
    year = Column(Integer, primary_key=True)
    quarter = Column(Integer, primary_key=True)
    total_assets = Column(BigInteger)
    total_equity = Column(BigInteger)
    current_assets = Column(BigInteger)
    current_liabilities = Column(BigInteger)
    accounts_receivable = Column(BigInteger)
    inventories = Column(BigInteger)
    contract_liabilities = Column(BigInteger)


class DividendModel(Base):
    __tablename__ = "dividends"
    __table_args__ = (UniqueConstraint("stock_id", "dividend_year", "period", name="uq_div"),)
    stock_id = Column(String(10), primary_key=True)
    dividend_year = Column(String(10), primary_key=True)
    period = Column(String(10), primary_key=True)
    cash_dividend = Column(Numeric(10, 4))
    stock_dividend = Column(Numeric(10, 4))
    ex_dividend_date = Column(Date)


class ValuationModel(Base):
    __tablename__ = "valuations"
    __table_args__ = (UniqueConstraint("date", "stock_id", name="uq_val"),)
    date = Column(Date, primary_key=True)
    stock_id = Column(String(10), primary_key=True)
    pe = Column(Numeric(10, 2))
    pb = Column(Numeric(10, 2))
    dividend_yield = Column(Numeric(8, 2))


class ShareholderDispersionModel(Base):
    __tablename__ = "shareholder_dispersion"
    __table_args__ = (UniqueConstraint("date", "stock_id", name="uq_disp"),)
    date = Column(Date, primary_key=True)
    stock_id = Column(String(10), primary_key=True)
    big_holder_pct = Column(Numeric(8, 2))
    big_holder_count = Column(Integer)
    total_holders = Column(Integer)


class ExDividendCalendarModel(Base):
    __tablename__ = "ex_dividend_calendar"
    __table_args__ = (UniqueConstraint("ex_date", "stock_id", name="uq_exdiv"),)
    ex_date = Column(Date, primary_key=True)
    stock_id = Column(String(10), primary_key=True)
    stock_name = Column(String(50))
    cash_dividend = Column(Numeric(10, 4))
    stock_dividend_ratio = Column(Numeric(12, 8))


class ETFHoldingModel(Base):
    __tablename__ = "etf_holdings"
    __table_args__ = (UniqueConstraint("etf_id", "stock_id", name="uq_etf_holding"),)
    etf_id = Column(String(10), primary_key=True)
    stock_id = Column(String(10), primary_key=True)
    stock_name = Column(String(50))
    weight = Column(Numeric(6, 2))
    shares = Column(BigInteger)
    updated_date = Column(Date)


class ETFInfoModel(Base):
    __tablename__ = "etf_info"
    etf_id = Column(String(10), primary_key=True)
    items = Column(JSONB)
    updated_date = Column(Date)


class NewsModel(Base):
    __tablename__ = "news"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    title = Column(String(500), nullable=False)
    summary = Column(Text, nullable=True)
    source = Column(Enum(NewsSourceEnum, name="news_source_enum", values_callable=lambda e: [m.value for m in e]), nullable=False)
    url = Column(String(1000), unique=True, nullable=False)
    published_at = Column(DateTime(timezone=True), nullable=False)
    crawled_at = Column(DateTime(timezone=True), server_default=func.now())
    category = Column(Enum(NewsCategoryEnum, name="news_category_enum", values_callable=lambda e: [m.value for m in e]), nullable=False)
    is_mops_permanent = Column(Boolean, default=False, nullable=False)


class NewsStockRelationModel(Base):
    __tablename__ = "news_stock_relations"

    news_id = Column(UUID(as_uuid=True), primary_key=True)
    stock_id = Column(String(10), primary_key=True)


class CrawlerLogModel(Base):
    __tablename__ = "crawler_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    crawler_name = Column(String(100), nullable=False)
    run_at = Column(DateTime(timezone=True), server_default=func.now())
    status = Column(Enum(CrawlerStatusEnum, name="crawler_status_enum", values_callable=lambda e: [m.value for m in e]), nullable=False)
    records_count = Column(Integer, nullable=True)
    error_message = Column(Text, nullable=True)
    duration_ms = Column(Integer, nullable=True)
