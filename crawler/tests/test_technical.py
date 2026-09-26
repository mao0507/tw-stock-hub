from datetime import date, timedelta

from analytics.technical import compute

# 期望值由前端 packages/charts/src/utils/indicators.ts 以同一數列算出，確保前後端一致
CLOSES = [
    100, 102.92, 105.55, 107.63, 108.98, 109.46, 109.07, 107.88, 106.06, 103.83, 101.48, 99.29,
    97.55, 96.47, 96.21, 96.83, 98.29, 100.47, 103.16, 106.1, 108.99, 111.56, 113.54, 114.76,
    115.11, 114.6, 113.3, 111.4, 109.13, 106.78, 104.65, 102.99, 102.03, 101.9, 102.65, 104.23,
    106.51, 109.25, 112.2, 115.06, 117.55, 119.43, 120.52, 120.75, 120.1, 118.7, 116.73, 114.43,
    112.1, 110.02, 108.45, 107.61, 107.61, 108.49, 110.19, 112.55, 115.35, 118.3, 121.12, 123.53,
]
D0 = date(2026, 1, 1)


def rows(closes=CLOSES):
    return [{"date": D0 + timedelta(days=i), "high": c + 1.5, "low": c - 1.2, "close": c, "volume": 1000 + i}
            for i, c in enumerate(closes)]


def test_matches_frontend_formulas_on_last_day():
    last = compute(rows())[-1]
    assert last["date"] == D0 + timedelta(days=59)
    assert (last["ma5"], last["ma20"]) == (118.17, 115.18)
    assert last["rsi14"] == 71.18
    assert (last["k9"], last["d9"]) == (79.34, 62.47)
    assert (last["dif"], last["dea"], last["macd_hist"]) == (2.23, 1.32, 1.82)


def test_insufficient_history_yields_none_not_zero():
    first = compute(rows())[0]
    assert first["ma5"] is None and first["rsi14"] is None and first["dif"] is None
    assert compute(rows())[4]["ma5"] is not None
    assert compute(rows())[58]["ma60"] is None  # 只有 59 筆 → MA60 不足


def test_volume_averages():
    last = compute(rows())[-1]
    assert last["vol_ma5"] == sum(1000 + i for i in range(55, 60)) // 5
    assert last["vol_ma20"] == sum(1000 + i for i in range(40, 60)) // 20


def test_empty_input():
    assert compute([]) == []
