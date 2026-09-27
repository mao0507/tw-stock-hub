from datetime import date, timedelta

from analytics.signals import SIGNALS, detect

D0 = date(2026, 1, 1)


def bar(i, close=100.0, high=None, low=None, volume=1_000_000, **ind):
    """一根日 K：預設指標為空，測試只填需要的欄位。"""
    return {
        "date": D0 + timedelta(days=i), "close": close, "high": high or close, "low": low or close,
        "volume": volume, "change_pct": ind.pop("change_pct", 0.0),
        **{k: None for k in ("ma5", "ma10", "ma20", "ma60", "k9", "d9", "dif", "dea", "rsi14")},
        **ind,
    }


def codes(rows, on=None):
    """偵測結果中，指定日（預設最後一天）的訊號代碼集合。"""
    day = on if on is not None else rows[-1]["date"]
    return {s["signal"] for s in detect(rows) if s["date"] == day}


def test_every_signal_has_side_and_label():
    for code, meta in SIGNALS.items():
        assert meta["side"] in ("bull", "bear"), code
        assert meta["label"], code


def test_ma_golden_and_death_cross_only_on_cross_day():
    up = [bar(0, ma5=99, ma20=100), bar(1, ma5=101, ma20=100), bar(2, ma5=102, ma20=100)]
    assert "ma_golden_cross" in codes(up[:2])
    assert "ma_golden_cross" not in codes(up)  # 第二天已在上方 → 不再出現
    down = [bar(0, ma5=101, ma20=100), bar(1, ma5=99, ma20=100)]
    assert "ma_death_cross" in codes(down)


def test_close_crosses_ma20_and_ma60():
    rows = [bar(0, close=99, ma20=100, ma60=120), bar(1, close=101, ma20=100, ma60=120)]
    assert codes(rows) >= {"above_ma20"}
    assert "above_ma60" not in codes(rows)
    rows = [bar(0, close=121, ma20=100, ma60=120), bar(1, close=119, ma20=100, ma60=120)]
    assert "below_ma60" in codes(rows)


def test_bullish_alignment_formation():
    rows = [bar(0, ma5=10, ma10=11, ma20=9, ma60=8), bar(1, ma5=12, ma10=11, ma20=10, ma60=9)]
    assert "ma_bullish_alignment" in codes(rows)
    rows.append(bar(2, ma5=13, ma10=12, ma20=11, ma60=10))
    assert "ma_bullish_alignment" not in codes(rows)  # 持續排列不算「成形」


def test_kd_crosses_only_in_zone():
    low = [bar(0, k9=15, d9=18), bar(1, k9=21, d9=19)]
    assert "kd_low_golden_cross" in codes(low)
    mid = [bar(0, k9=45, d9=48), bar(1, k9=50, d9=49)]
    assert "kd_low_golden_cross" not in codes(mid)
    high = [bar(0, k9=85, d9=82), bar(1, k9=78, d9=80)]
    assert "kd_high_death_cross" in codes(high)


def test_macd_cross():
    assert "macd_golden_cross" in codes([bar(0, dif=-1, dea=0), bar(1, dif=0.5, dea=0.1)])
    assert "macd_death_cross" in codes([bar(0, dif=1, dea=0.5), bar(1, dif=0.2, dea=0.4)])


def test_rsi_entering_zones():
    assert "rsi_overbought" in codes([bar(0, rsi14=68), bar(1, rsi14=72)])
    assert "rsi_overbought" not in codes([bar(0, rsi14=71), bar(1, rsi14=75)])
    assert "rsi_oversold" in codes([bar(0, rsi14=31), bar(1, rsi14=28)])


def test_breakout_20d_high_first_day_only():
    rows = [bar(i, close=100, high=101) for i in range(20)]
    rows.append(bar(20, close=102, high=103))  # 收盤突破前 20 日最高 101
    assert "breakout_20d_high" in codes(rows)
    assert "breakout_60d_high" not in codes(rows)  # 歷史不足 60 日
    rows.append(bar(21, close=104, high=105))
    assert "breakout_20d_high" not in codes(rows)  # 前一日已突破


def test_breakdown_20d_low():
    rows = [bar(i, close=100, low=99) for i in range(20)] + [bar(20, close=98, low=97)]
    assert "breakdown_20d_low" in codes(rows)


def test_volume_spike_side_follows_price_and_needs_min_volume():
    base = [bar(i, volume=1_000_000) for i in range(5)]
    up = base + [bar(5, volume=2_500_000, change_pct=3)]
    [s] = [x for x in detect(up) if x["signal"] == "volume_spike"]
    assert s["side"] == "bull" and s["values"]["ratio"] == 2.5
    down = base + [bar(5, volume=2_500_000, change_pct=-2)]
    assert [x["side"] for x in detect(down) if x["signal"] == "volume_spike"] == ["bear"]
    thin = [bar(i, volume=100_000) for i in range(5)] + [bar(5, volume=400_000, change_pct=1)]
    assert "volume_spike" not in codes(thin)  # 未達 500 張


def test_bollinger_break():
    flat = [bar(i, close=100 + (i % 2)) for i in range(20)]
    assert "boll_break_upper" in codes(flat + [bar(20, close=110)])
    assert "boll_break_lower" in codes(flat + [bar(20, close=90)])


def test_values_are_recorded():
    [s] = [x for x in detect([bar(0, k9=15, d9=18), bar(1, k9=21, d9=19)]) if x["signal"] == "kd_low_golden_cross"]
    assert s["values"] == {"k": 21, "d": 19}


def test_missing_indicators_produce_nothing():
    assert detect([bar(0), bar(1)]) == []
    assert detect([]) == []
