from loguru import logger
from db.connection import get_session
from db.models import (
    BrokerTradingModel,
    BrokerTradingDetailModel,
    MonthlyRevenueModel,
    FinancialStatementModel,
    BalanceSheetModel,
    DividendModel,
    ValuationModel,
    ShareholderDispersionModel,
    ExDividendCalendarModel,
    ETFHoldingModel,
    ETFInfoModel,
    DailyQuoteModel,
    MarketIndexModel,
    InstitutionalTradingModel,
    MarginTradingModel,
    SectorPerformanceModel,
    StockModel,
)
from db.repository import bulk_upsert


class DataWriter:
    @staticmethod
    async def write_daily_quotes(records: list[dict]) -> int:
        if not records:
            return 0
        async with get_session() as session:
            count = await bulk_upsert(session, DailyQuoteModel, records, ["stock_id", "date"])
        logger.debug(f"[Writer] daily_quotes: {count} records upserted")
        return count

    @staticmethod
    async def write_market_index(records: list[dict]) -> int:
        if not records:
            return 0
        async with get_session() as session:
            count = await bulk_upsert(session, MarketIndexModel, records, ["date"])
        logger.debug(f"[Writer] market_index: {count} records upserted")
        return count

    @staticmethod
    async def write_institutional(records: list[dict]) -> int:
        if not records:
            return 0
        async with get_session() as session:
            count = await bulk_upsert(session, InstitutionalTradingModel, records, ["stock_id", "date"])
        logger.debug(f"[Writer] institutional_trading: {count} records upserted")
        return count

    @staticmethod
    async def write_margin(records: list[dict]) -> int:
        if not records:
            return 0
        async with get_session() as session:
            count = await bulk_upsert(session, MarginTradingModel, records, ["stock_id", "date"])
        logger.debug(f"[Writer] margin_trading: {count} records upserted")
        return count

    @staticmethod
    async def write_sector(records: list[dict]) -> int:
        if not records:
            return 0
        async with get_session() as session:
            count = await bulk_upsert(session, SectorPerformanceModel, records, ["sector_name", "date"])
        logger.debug(f"[Writer] sector_performance: {count} records upserted")
        return count

    @staticmethod
    async def write_broker(records: list[dict]) -> int:
        if not records:
            return 0
        async with get_session() as session:
            count = await bulk_upsert(
                session, BrokerTradingModel, records, ["date", "stock_id", "broker_name"]
            )
        logger.debug(f"[Writer] broker_trading: {count} records upserted")
        return count

    @staticmethod
    async def write_broker_detail(records: list[dict]) -> int:
        if not records:
            return 0
        async with get_session() as session:
            count = await bulk_upsert(
                session, BrokerTradingDetailModel, records,
                ["date", "stock_id", "broker_name", "price"],
            )
        logger.debug(f"[Writer] broker_trading_detail: {count} records upserted")
        return count

    @staticmethod
    async def write_monthly_revenue(records: list[dict]) -> int:
        if not records:
            return 0
        async with get_session() as session:
            return await bulk_upsert(session, MonthlyRevenueModel, records, ["stock_id", "year_month"])

    @staticmethod
    async def write_financials(records: list[dict]) -> int:
        if not records:
            return 0
        async with get_session() as session:
            return await bulk_upsert(session, FinancialStatementModel, records, ["stock_id", "year", "quarter"])

    @staticmethod
    async def write_balance_sheets(records: list[dict]) -> int:
        if not records:
            return 0
        async with get_session() as session:
            return await bulk_upsert(session, BalanceSheetModel, records, ["stock_id", "year", "quarter"])

    @staticmethod
    async def write_dividends(records: list[dict]) -> int:
        if not records:
            return 0
        from sqlalchemy.dialects.postgresql import insert
        table = DividendModel.__table__
        async with get_session() as session:
            stmt = insert(table).values(records)
            stmt = stmt.on_conflict_do_update(
                index_elements=["stock_id", "dividend_year", "period"],
                set_={
                    "cash_dividend": stmt.excluded["cash_dividend"],
                    "stock_dividend": stmt.excluded["stock_dividend"],
                    "ex_dividend_date": stmt.excluded["ex_dividend_date"],
                },
                # TWSE 快照無除息日、且會把季配壓成同一期別 → 不可覆蓋 FinMind 已寫入（有除息日）的期別
                where=(stmt.excluded["ex_dividend_date"].isnot(None))
                | (table.c.ex_dividend_date.is_(None)),
            )
            result = await session.execute(stmt)
            return result.rowcount or len(records)

    @staticmethod
    async def write_valuations(records: list[dict]) -> int:
        if not records:
            return 0
        async with get_session() as session:
            return await bulk_upsert(session, ValuationModel, records, ["date", "stock_id"])

    @staticmethod
    async def write_dispersion(records: list[dict]) -> int:
        if not records:
            return 0
        async with get_session() as session:
            return await bulk_upsert(session, ShareholderDispersionModel, records, ["date", "stock_id"])

    @staticmethod
    async def write_ex_dividend(records: list[dict]) -> int:
        if not records:
            return 0
        async with get_session() as session:
            return await bulk_upsert(session, ExDividendCalendarModel, records, ["ex_date", "stock_id"])

    @staticmethod
    async def write_etf_holdings(etf_id: str, records: list[dict]) -> int:
        if not records:
            return 0
        async with get_session() as session:
            # 先清舊持股再寫（成分會變動）
            from sqlalchemy import text
            await session.execute(
                text("DELETE FROM etf_holdings WHERE etf_id = :e"), {"e": etf_id}
            )
            count = await bulk_upsert(session, ETFHoldingModel, records, ["etf_id", "stock_id"])
        return count

    @staticmethod
    async def write_etf_info(etf_id: str, items: list, updated) -> int:
        from sqlalchemy.dialects.postgresql import insert
        table = ETFInfoModel.__table__
        async with get_session() as session:
            stmt = insert(table).values(etf_id=etf_id, items=items, updated_date=updated)
            stmt = stmt.on_conflict_do_update(
                index_elements=["etf_id"],
                # 用 bracket：.items 會撞到 mapping 的 items() 方法
                set_={"items": stmt.excluded["items"], "updated_date": stmt.excluded["updated_date"]},
            )
            await session.execute(stmt)
        return len(items)

    @staticmethod
    async def upsert_stocks(records: list[dict]) -> int:
        """新上市/更名用。衝突時只更新 name/market，**保留 sector 等其他欄位**
        （避免每日行情爬蟲把 update_stock_sectors 設好的 sector 清空）。"""
        if not records:
            return 0
        from sqlalchemy.dialects.postgresql import insert
        table = StockModel.__table__
        async with get_session() as session:
            stmt = insert(table).values(records)
            stmt = stmt.on_conflict_do_update(
                index_elements=["id"],
                set_={"name": stmt.excluded.name, "market": stmt.excluded.market},
            )
            result = await session.execute(stmt)
            count = result.rowcount or len(records)
        logger.debug(f"[Writer] stocks: {count} upserted (sector preserved)")
        return count
