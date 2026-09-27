"""技術訊號偵測（#29）：盤後依日線與技術指標找出當日事件，寫入 technical_signals。

口徑：
- 交叉／站上／跌破／進入區間：一律「前一日不成立、當日成立」，只在發生當天出現一次。
- 突破 N 日高（跌破 N 日低）：收盤高於前 N 個交易日（不含當日）最高價，且前一日尚未突破 → 只記第一天。
- 爆量：成交量 > 前 5 日（不含當日）均量 × 2，且至少 500 張；多空依當日漲跌，平盤不記。
- 布林：20 日 SMA ± 2 倍標準差（與前端圖表相同，含當日）。
- MACD 柱狀體 = (DIF − DEA) × 2，翻紅即黃金交叉，不另列。
代碼與多空需與前端 packages/types 的 SIGNAL_META 一致。
"""

import math
from datetime import date, timedelta

from loguru import logger
from sqlalchemy import text

from db.connection import get_session
from db.repository import bulk_upsert

SIGNALS: dict[str, dict[str, str]] = {
    "ma_golden_cross": {"side": "bull", "label": "MA5 黃金交叉 MA20"},
    "ma_death_cross": {"side": "bear", "label": "MA5 死亡交叉 MA20"},
    "above_ma20": {"side": "bull", "label": "站上月線 MA20"},
    "below_ma20": {"side": "bear", "label": "跌破月線 MA20"},
    "above_ma60": {"side": "bull", "label": "站上季線 MA60"},
    "below_ma60": {"side": "bear", "label": "跌破季線 MA60"},
    "ma_bullish_alignment": {"side": "bull", "label": "均線多頭排列成形"},
    "kd_low_golden_cross": {"side": "bull", "label": "KD 低檔黃金交叉"},
    "kd_high_death_cross": {"side": "bear", "label": "KD 高檔死亡交叉"},
    "macd_golden_cross": {"side": "bull", "label": "MACD 黃金交叉"},
    "macd_death_cross": {"side": "bear", "label": "MACD 死亡交叉"},
    "rsi_overbought": {"side": "bear", "label": "RSI 進入超買"},
    "rsi_oversold": {"side": "bull", "label": "RSI 進入超賣"},
    "breakout_20d_high": {"side": "bull", "label": "突破 20 日新高"},
    "breakout_60d_high": {"side": "bull", "label": "突破 60 日新高"},
    "breakdown_20d_low": {"side": "bear", "label": "跌破 20 日新低"},
    "breakdown_60d_low": {"side": "bear", "label": "跌破 60 日新低"},
    "volume_spike": {"side": "bull", "label": "爆量"},  # 多空依當日漲跌
    "boll_break_upper": {"side": "bull", "label": "突破布林上軌"},
    "boll_break_lower": {"side": "bear", "label": "跌破布林下軌"},
}

SPIKE_RATIO = 2.0
SPIKE_MIN_VOLUME = 500_000  # 股（500 張）
DAILY_LOOKBACK_DAYS = 150  # 60 日突破需約 62 個交易日，多抓涵蓋長假


def _r(v: float) -> float:
    return round(float(v), 2)


def _gt(a, b) -> bool:
    return a is not None and b is not None and a > b


def _cross_up(pa, pb, a, b) -> bool:
    """前一日 a <= b、當日 a > b"""
    return None not in (pa, pb, a, b) and pa <= pb and a > b


def _aligned(r: dict) -> bool:
    ms = [r["ma5"], r["ma10"], r["ma20"], r["ma60"]]
    return None not in ms and ms[0] > ms[1] > ms[2] > ms[3]


def _boll(closes: list[float], i: int, n: int = 20, k: float = 2.0) -> tuple[float, float] | None:
    if i < n - 1:
        return None
    w = closes[i - n + 1: i + 1]
    mean = sum(w) / n
    sd = math.sqrt(sum((c - mean) ** 2 for c in w) / n)
    return mean + k * sd, mean - k * sd


def _prior_extreme(rows: list[dict], i: int, n: int, key: str, fn) -> float | None:
    """前 n 個交易日（不含 i）的最高／最低；歷史不足回 None"""
    if i < n:
        return None
    return fn(float(r[key]) for r in rows[i - n: i])


def _detect_day(rows: list[dict], closes: list[float], i: int) -> list[tuple[str, dict, str | None]]:
    """回 [(signal, values, side 覆寫或 None)]"""
    cur, prev = rows[i], rows[i - 1]
    close, pclose = closes[i], closes[i - 1]
    out: list[tuple[str, dict, str | None]] = []
    add = lambda code, values, side=None: out.append((code, values, side))  # noqa: E731

    if _cross_up(prev["ma5"], prev["ma20"], cur["ma5"], cur["ma20"]):
        add("ma_golden_cross", {"ma5": _r(cur["ma5"]), "ma20": _r(cur["ma20"])})
    if _cross_up(prev["ma20"], prev["ma5"], cur["ma20"], cur["ma5"]):
        add("ma_death_cross", {"ma5": _r(cur["ma5"]), "ma20": _r(cur["ma20"])})
    for ma in ("ma20", "ma60"):
        if _cross_up(pclose, prev[ma], close, cur[ma]):
            add(f"above_{ma}", {"close": _r(close), ma: _r(cur[ma])})
        if _cross_up(prev[ma], pclose, cur[ma], close):
            add(f"below_{ma}", {"close": _r(close), ma: _r(cur[ma])})
    if _aligned(cur) and not _aligned(prev):
        add("ma_bullish_alignment", {k: _r(cur[k]) for k in ("ma5", "ma10", "ma20", "ma60")})

    k, d, pk, pd = cur["k9"], cur["d9"], prev["k9"], prev["d9"]
    if _cross_up(pk, pd, k, d) and pk < 20:
        add("kd_low_golden_cross", {"k": _r(k), "d": _r(d)})
    if _cross_up(pd, pk, d, k) and pk > 80:
        add("kd_high_death_cross", {"k": _r(k), "d": _r(d)})

    if _cross_up(prev["dif"], prev["dea"], cur["dif"], cur["dea"]):
        add("macd_golden_cross", {"dif": _r(cur["dif"]), "dea": _r(cur["dea"])})
    if _cross_up(prev["dea"], prev["dif"], cur["dea"], cur["dif"]):
        add("macd_death_cross", {"dif": _r(cur["dif"]), "dea": _r(cur["dea"])})

    rsi, prsi = cur["rsi14"], prev["rsi14"]
    if rsi is not None and prsi is not None:
        if prsi <= 70 < rsi:
            add("rsi_overbought", {"rsi": _r(rsi)})
        if prsi >= 30 > rsi:
            add("rsi_oversold", {"rsi": _r(rsi)})

    for n in (20, 60):
        hi, phi = _prior_extreme(rows, i, n, "high", max), _prior_extreme(rows, i - 1, n, "high", max)
        if _gt(close, hi) and not _gt(pclose, phi):
            add(f"breakout_{n}d_high", {"close": _r(close), "prior_high": _r(hi)})
        lo, plo = _prior_extreme(rows, i, n, "low", min), _prior_extreme(rows, i - 1, n, "low", min)
        if _gt(lo, close) and not _gt(plo, pclose):
            add(f"breakdown_{n}d_low", {"close": _r(close), "prior_low": _r(lo)})

    if i >= 5:
        avg5 = sum(int(r["volume"]) for r in rows[i - 5: i]) / 5
        vol, chg = int(cur["volume"]), cur.get("change_pct")
        if avg5 > 0 and vol >= SPIKE_MIN_VOLUME and vol > avg5 * SPIKE_RATIO and chg:
            add("volume_spike", {"volume": vol, "ratio": _r(vol / avg5)}, "bull" if chg > 0 else "bear")

    band, pband = _boll(closes, i), _boll(closes, i - 1)
    if band and pband:
        if close > band[0] and pclose <= pband[0]:
            add("boll_break_upper", {"close": _r(close), "upper": _r(band[0])})
        if close < band[1] and pclose >= pband[1]:
            add("boll_break_lower", {"close": _r(close), "lower": _r(band[1])})
    return out


def detect(rows: list[dict]) -> list[dict]:
    """rows：依日期升冪，含 date/close/high/low/volume/change_pct 與技術指標（缺值為 None）。"""
    closes = [float(r["close"]) for r in rows]
    out = []
    for i in range(1, len(rows)):
        for code, values, side in _detect_day(rows, closes, i):
            out.append({
                "date": rows[i]["date"], "signal": code,
                "side": side or SIGNALS[code]["side"], "values": values,
            })
    return out


_QUERY = text(
    """
    SELECT q.date, q.close, q.high, q.low, q.volume, q.change_pct,
           t.ma5, t.ma10, t.ma20, t.ma60, t.k9, t.d9, t.dif, t.dea, t.rsi14
    FROM daily_quotes q
    LEFT JOIN technical_indicators t ON t.stock_id = q.stock_id AND t.date = q.date AND t.date BETWEEN :a AND :b
    WHERE q.stock_id = :s AND q.date BETWEEN :a AND :b
    ORDER BY q.date
    """
)

_NUMERIC = ("close", "high", "low", "change_pct", "ma5", "ma10", "ma20", "ma60", "k9", "d9", "dif", "dea", "rsi14")


def _normalize(row) -> dict:
    r = dict(row._mapping)
    for k in _NUMERIC:
        if r[k] is not None:
            r[k] = float(r[k])
    return r


async def run(target: date | None = None, full: bool = False) -> int:
    """每日（只寫目標日）或全量（寫全部日期）。回寫入筆數。"""
    from db.models import TechnicalSignalModel

    target = target or date.today()
    since = date(2000, 1, 1) if full else target - timedelta(days=DAILY_LOOKBACK_DAYS)
    async with get_session() as session:
        stocks = [r[0] for r in (await session.execute(text("SELECT id FROM stocks WHERE is_active ORDER BY id"))).fetchall()]
    written = 0
    for i, sid in enumerate(stocks, 1):
        async with get_session() as session:
            rows = [_normalize(r) for r in (await session.execute(_QUERY, {"s": sid, "a": since, "b": target})).fetchall()]
            if not rows or (not full and rows[-1]["date"] != target):
                continue  # 停牌、休市不產生訊號
            found = [s for s in detect(rows) if full or s["date"] == target]
            if found:
                written += await bulk_upsert(
                    session, TechnicalSignalModel,
                    [dict(s, stock_id=sid) for s in found], ["date", "stock_id", "signal"])
        if full and i % 200 == 0:
            logger.info(f"[signals] 全量 {i}/{len(stocks)}")
    logger.info(f"[signals] {'全量' if full else target} 寫入 {written} 筆")
    return written
