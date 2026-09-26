from datetime import date, timedelta

import pytest

from analytics.strength import LOOKBACK, compute_rs, weighted_return

D0 = date(2025, 1, 1)


def series(growth: float, n: int = LOOKBACK + 1):
    """每日固定成長率的收盤序列。"""
    return [(D0 + timedelta(days=i), 100 * (1 + growth) ** i) for i in range(n)]


def test_weighted_return_combines_horizons():
    s = [(D0 + timedelta(days=i), 100.0) for i in range(LOOKBACK + 1)]
    s[-1] = (s[-1][0], 110.0)  # 只有最後一天漲 10% → 各期報酬皆 10%
    assert weighted_return([c for _, c in s]) == pytest.approx(0.10)


def test_insufficient_history_is_none():
    assert weighted_return([100.0] * LOOKBACK) is None


def test_ranks_into_1_to_99_percentiles():
    data = {"UP": series(0.002), "MID": series(0.0), "DOWN": series(-0.002)}
    target = data["UP"][-1][0]
    rs = compute_rs(data, target)
    assert rs["UP"]["rs_score"] == 99
    assert rs["DOWN"]["rs_score"] == 1
    assert 1 < rs["MID"]["rs_score"] < 99


def test_excludes_stocks_without_quote_on_target_or_short_history():
    data = {
        "OK1": series(0.001),
        "OK2": series(0.002),
        "SHORT": series(0.01, n=100),
        "HALTED": series(0.003)[:-1],  # 目標日沒有行情（停牌）
    }
    target = data["OK1"][-1][0]
    assert set(compute_rs(data, target)) == {"OK1", "OK2"}


def test_single_stock_gets_top_score_and_empty_input():
    data = {"ONLY": series(0.001)}
    assert compute_rs(data, data["ONLY"][-1][0])["ONLY"]["rs_score"] == 99
    assert compute_rs({}, D0) == {}
