"""RS 相對強弱：以多期報酬加權後，換算為當日全市場百分位（1–99）。

加權：20 日 0.2、60 日 0.3、120 日 0.25、250 日 0.25（交易日）。歷史不足 250 日者不給分。
每日只算目標日；--full 對所有有行情的日期回算。
"""

from datetime import date, timedelta

from loguru import logger
from sqlalchemy import text

from db.connection import get_session
from db.repository import bulk_upsert

WEIGHTS = {20: 0.2, 60: 0.3, 120: 0.25, 250: 0.25}
LOOKBACK = max(WEIGHTS)


def weighted_return(closes: list[float]) -> float | None:
    """closes 依日期升冪、最後一筆為目標日。"""
    if len(closes) <= LOOKBACK:
        return None
    last = closes[-1]
    total = 0.0
    for n, w in WEIGHTS.items():
        base = closes[-1 - n]
        if base <= 0:
            return None
        total += w * (last / base - 1)
    return total


def returns_by_date(series: dict[str, list[tuple[date, float]]]) -> dict[date, list[tuple[str, float]]]:
    """每檔每個交易日的加權報酬，依日期分組（每檔只掃一遍）。"""
    out: dict[date, list[tuple[str, float]]] = {}
    for sid, rows in series.items():
        closes = [c for _, c in rows]
        for i in range(LOOKBACK, len(rows)):
            wr = weighted_return(closes[i - LOOKBACK: i + 1])
            if wr is not None:
                out.setdefault(rows[i][0], []).append((sid, wr))
    return out


def rank(scored: list[tuple[str, float]]) -> dict[str, dict]:
    """加權報酬 → 百分位 1–99（最強 99）。"""
    scored = sorted(scored, key=lambda x: x[1])
    n = len(scored)
    return {
        sid: {
            "rs_score": 99 if n == 1 else 1 + round(i / (n - 1) * 98),
            "weighted_return": round(wr, 4),
        }
        for i, (sid, wr) in enumerate(scored)
    }


def compute_rs(series: dict[str, list[tuple[date, float]]], target: date) -> dict[str, dict]:
    """series：{stock_id: [(date, close), ...] 升冪}。目標日沒有行情（停牌）者不給分。"""
    return rank(returns_by_date(series).get(target, []))


async def _load(since: date, until: date) -> dict[str, list[tuple[date, float]]]:
    async with get_session() as session:
        r = await session.execute(text(
            """
            SELECT q.stock_id, q.date, q.close FROM daily_quotes q
            JOIN stocks s ON s.id = q.stock_id AND s.is_active
            WHERE q.date BETWEEN :a AND :b ORDER BY q.stock_id, q.date
            """
        ), {"a": since, "b": until})
        out: dict[str, list[tuple[date, float]]] = {}
        for sid, d, c in r.fetchall():
            out.setdefault(sid, []).append((d, float(c)))
        return out


async def run(target: date | None = None, full: bool = False) -> int:
    from db.models import MarketStrengthModel

    target = target or date.today()
    # 250 交易日約 1 年；多抓以涵蓋長假
    since = date(2000, 1, 1) if full else target - timedelta(days=400)
    series = await _load(since, target)
    by_date = returns_by_date(series)
    dates = sorted(by_date) if full else [target]
    written = 0
    for i, d in enumerate(dates, 1):
        rs = rank(by_date.get(d, []))
        if not rs:
            continue
        records = [{"date": d, "stock_id": sid, **v} for sid, v in rs.items()]
        async with get_session() as session:
            written += await bulk_upsert(session, MarketStrengthModel, records, ["stock_id", "date"])
        if full and i % 50 == 0:
            logger.info(f"[strength] 全量 {i}/{len(dates)}")
    logger.info(f"[strength] {'全量' if full else target} 寫入 {written} 筆")
    return written
