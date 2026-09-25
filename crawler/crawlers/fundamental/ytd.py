"""TWSE OpenAPI 綜合損益表（t187ap06_L_ci）是「年初至本季累計」，financial_statements 存單季。

單季 = 本季累計 − 同年度前幾季單季合計。前幾季單季資料不齊時無法換算，直接略過該筆，
避免把累計值當單季寫入（會讓 ROE、TTM EPS、發放率放大 2–4 倍）。
"""

from collections.abc import Mapping

# 需要換算的損益科目
FIELDS = ("revenue", "gross_profit", "op_income", "pretax_income", "net_income", "eps")

Prior = Mapping[tuple[int, int], Mapping[str, float | int | None]]


def _minus(ytd_value, prior_values):
    if ytd_value is None or any(v is None for v in prior_values):
        return None
    result = ytd_value - sum(prior_values)
    # EPS 為小數；其餘科目為整數（千元）
    return round(result, 2) if isinstance(result, float) else result


def to_single_quarter(records: list[dict], prior_by_stock: Mapping[str, Prior]) -> list[dict]:
    """把累計值轉成單季。prior_by_stock[stock_id][(year, quarter)] 為資料庫已有的單季值。"""
    out = []
    for r in records:
        q = r["quarter"]
        if q == 1:
            out.append(r)
            continue
        prior = prior_by_stock.get(r["stock_id"], {})
        previous = [prior.get((r["year"], p)) for p in range(1, q)]
        if any(p is None for p in previous):
            continue
        out.append({**r, **{f: _minus(r.get(f), [p.get(f) for p in previous]) for f in FIELDS}})
    return out
