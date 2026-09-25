from crawlers.fundamental.ytd import FIELDS, to_single_quarter


def ytd(quarter, revenue, eps, **kw):
    base = {f: None for f in FIELDS}
    base.update({"stock_id": "2330", "year": 2026, "quarter": quarter, "revenue": revenue, "eps": eps})
    base.update(kw)
    return base


def single(quarter, revenue, eps):
    base = {f: None for f in FIELDS}
    base.update({"revenue": revenue, "eps": eps})
    return (2026, quarter), base


def test_q1_is_already_single_quarter():
    out = to_single_quarter([ytd(1, 100, 1.5)], {})
    assert out == [ytd(1, 100, 1.5)]


def test_q2_subtracts_q1():
    prior = dict([single(1, 100, 1.5)])
    [r] = to_single_quarter([ytd(2, 250, 3.7)], {"2330": prior})
    assert r["quarter"] == 2
    assert r["revenue"] == 150
    assert r["eps"] == 2.2


def test_q3_subtracts_q1_and_q2():
    prior = dict([single(1, 100, 1.0), single(2, 150, 2.0)])
    [r] = to_single_quarter([ytd(3, 400, 4.5)], {"2330": prior})
    assert r["revenue"] == 150
    assert r["eps"] == 1.5


def test_missing_prior_quarter_skips_record():
    # 缺 Q1 單季值就無法換算，寧可不寫也不要把累計值當單季
    prior = dict([single(2, 150, 2.0)])
    assert to_single_quarter([ytd(3, 400, 4.5)], {"2330": prior}) == []


def test_null_fields_stay_null():
    prior = dict([single(1, 100, None)])
    [r] = to_single_quarter([ytd(2, 250, 3.7)], {"2330": prior})
    assert r["revenue"] == 150
    assert r["eps"] is None
