"""技術指標：MA、RSI(14)、KD(9,3,3)、MACD(12,26,9)、均量。

公式與前端 packages/charts/src/utils/indicators.ts 一致（圖表即時算、這裡預算給選股器用）。
每日增量：每檔讀最近 WINDOW 個交易日、只寫目標日；--full 全量重算並寫入全部日期。
KD 與 MACD 是遞迴式，增量窗口內重新起算，與全量結果只差在收斂前的極小誤差。
"""

import math
from datetime import date, timedelta

from loguru import logger
from sqlalchemy import text

from db.connection import get_session
from db.repository import bulk_upsert

WINDOW = 260  # MA240 需 240 日，多留緩衝讓 KD/MACD 收斂
MA_PERIODS = (5, 10, 20, 60, 120, 240)


def _round(v: float | None) -> float | None:
    # 與 JS Math.round(v * 100) / 100 相同（.5 一律往正無限大進位）
    return None if v is None else math.floor(v * 100 + 0.5) / 100


def _ma(values: list[float], period: int) -> list[float | None]:
    out: list[float | None] = [None] * len(values)
    s = 0.0
    for i, v in enumerate(values):
        s += v
        if i >= period:
            s -= values[i - period]
        if i >= period - 1:
            out[i] = s / period
    return out


def _rsi(closes: list[float], period: int = 14) -> list[float | None]:
    out: list[float | None] = [None] * len(closes)
    if len(closes) <= period:
        return out
    gain = sum(max(closes[i] - closes[i - 1], 0) for i in range(1, period + 1)) / period
    loss = sum(max(closes[i - 1] - closes[i], 0) for i in range(1, period + 1)) / period
    rsi = lambda g, lo: 100.0 if lo == 0 else 100 - 100 / (1 + g / lo)  # noqa: E731
    out[period] = rsi(gain, loss)
    for i in range(period + 1, len(closes)):
        diff = closes[i] - closes[i - 1]
        gain = (gain * (period - 1) + max(diff, 0)) / period
        loss = (loss * (period - 1) + max(-diff, 0)) / period
        out[i] = rsi(gain, loss)
    return out


def _kd(rows: list[dict], n: int = 9) -> tuple[list[float | None], list[float | None]]:
    k: list[float | None] = [None] * len(rows)
    d: list[float | None] = [None] * len(rows)
    pk = pd = 50.0
    for i in range(n - 1, len(rows)):
        window = rows[i - n + 1: i + 1]
        hh = max(r["high"] for r in window)
        ll = min(r["low"] for r in window)
        rsv = 0.0 if hh == ll else (rows[i]["close"] - ll) / (hh - ll) * 100
        pk = (pk * 2 + rsv) / 3
        pd = (pd * 2 + pk) / 3
        k[i], d[i] = pk, pd
    return k, d


def _ema(values: list[float], period: int) -> list[float]:
    out: list[float] = []
    a = 2 / (period + 1)
    prev = values[0] if values else 0.0
    for i, v in enumerate(values):
        prev = v if i == 0 else v * a + prev * (1 - a)
        out.append(prev)
    return out


def compute(rows: list[dict]) -> list[dict]:
    """rows：依日期升冪的 {date, high, low, close, volume}。回每日指標（資料不足為 None）。"""
    if not rows:
        return []
    closes = [float(r["close"]) for r in rows]
    vols = [int(r["volume"]) for r in rows]
    mas = {p: _ma(closes, p) for p in MA_PERIODS}
    vol5, vol20 = _ma(vols, 5), _ma(vols, 20)
    rsi = _rsi(closes)
    k, d = _kd([{"high": float(r["high"]), "low": float(r["low"]), "close": float(r["close"])} for r in rows])
    dif_raw = [f - s for f, s in zip(_ema(closes, 12), _ema(closes, 26))]
    dea_raw = _ema(dif_raw, 9)
    out = []
    for i, r in enumerate(rows):
        macd_ok = i >= 25  # 慢線 26 日穩定後才有效（與前端相同）
        out.append({
            "date": r["date"],
            **{f"ma{p}": _round(mas[p][i]) for p in MA_PERIODS},
            "rsi14": _round(rsi[i]),
            "k9": _round(k[i]),
            "d9": _round(d[i]),
            "dif": _round(dif_raw[i]) if macd_ok else None,
            "dea": _round(dea_raw[i]) if macd_ok else None,
            "macd_hist": _round((dif_raw[i] - dea_raw[i]) * 2) if macd_ok else None,
            "vol_ma5": None if vol5[i] is None else int(vol5[i]),
            "vol_ma20": None if vol20[i] is None else int(vol20[i]),
        })
    return out


async def _stock_ids(session) -> list[str]:
    r = await session.execute(text("SELECT id FROM stocks WHERE is_active ORDER BY id"))
    return [row[0] for row in r.fetchall()]


async def _quotes(session, stock_id: str, until: date, limit: int | None) -> list[dict]:
    # 每日模式帶日期下限（WINDOW 交易日約 1.1 年），避免 hypertable 掃過全部 chunk
    since = until - timedelta(days=500) if limit else date(2000, 1, 1)
    sql = """
        SELECT date, high, low, close, volume FROM daily_quotes
        WHERE stock_id = :s AND date BETWEEN :a AND :d ORDER BY date DESC
    """ + (" LIMIT :n" if limit else "")
    r = await session.execute(text(sql), {"s": stock_id, "a": since, "d": until, "n": limit})
    return [dict(row._mapping) for row in reversed(r.fetchall())]


async def run(target: date | None = None, full: bool = False) -> int:
    """每日（寫目標日）或全量（寫全部日期）。回寫入筆數。"""
    from db.models import TechnicalIndicatorModel

    target = target or date.today()
    written = 0
    async with get_session() as session:
        stocks = await _stock_ids(session)
    for i, sid in enumerate(stocks, 1):
        async with get_session() as session:
            rows = await _quotes(session, sid, target, None if full else WINDOW)
            if not rows or (not full and rows[-1]["date"] != target):
                continue  # 當天沒行情（停牌、休市）不寫
            ind = compute(rows)
            records = [dict(x, stock_id=sid) for x in (ind if full else ind[-1:])]
            written += await bulk_upsert(session, TechnicalIndicatorModel, records, ["stock_id", "date"])
        if full and i % 200 == 0:
            logger.info(f"[technical] 全量 {i}/{len(stocks)}")
    logger.info(f"[technical] {'全量' if full else target} 寫入 {written} 筆")
    return written
