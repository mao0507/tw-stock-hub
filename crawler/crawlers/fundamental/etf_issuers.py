"""投信官網 ETF 每日成分（#45）。每家投信一個 parser，都回傳 (資料日期, rows)，rows 格式同 MoneyDJ：
{name, stock_id(None，寫入時再以 stocks 表比對), symbol, weight, shares}。

ISSUER_PARSERS：投信名稱（stocks.issuer）→ 抓取函式。有 parser 的投信其 ETF 一律用官網資料，MoneyDJ 只補其他。
"""

import json
import re
from collections.abc import Awaitable, Callable
from datetime import date, timedelta

import httpx

Rows = list[dict]
Fetcher = Callable[[httpx.AsyncClient, str], Awaitable[tuple[date | None, Rows]]]


# ── Nuxt 內嵌狀態：window.__NUXT__=(function(a,b,…){return {...}}(v1,v2,…));
# 值以參數代換壓縮，這裡解析參數表與呼叫引數，再把物件字面值裡的識別字換回實際值。

_TOKEN = re.compile(
    r'\s*(?:(?P<str>"(?:[^"\\]|\\.)*")|(?P<num>-?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?)'
    r'|(?P<id>[A-Za-z_$][\w$]*)|(?P<p>[{}\[\]:,()]))'
)


class _Reader:
    def __init__(self, text: str, pos: int, env: dict):
        self.text, self.pos, self.env = text, pos, env

    def _next(self) -> tuple[str, str]:
        m = _TOKEN.match(self.text, self.pos)
        if not m:
            raise ValueError(f"無法解析：{self.text[self.pos:self.pos + 40]!r}")
        self.pos = m.end()
        kind = m.lastgroup or ""
        return kind, m.group(kind)

    def _peek(self) -> str:
        m = _TOKEN.match(self.text, self.pos)
        return m.group(m.lastgroup) if m and m.lastgroup else ""

    def value(self):
        kind, tok = self._next()
        if kind == "str":
            return json.loads(tok)
        if kind == "num":
            return float(tok) if re.search(r"[.e]", tok) else int(tok)
        if kind == "id":
            if tok == "void":  # void 0
                self._next()
                return None
            if self._peek() == "(":  # Array(8) 之類的建構呼叫：只需長度
                self._next()
                n = self.value()
                self._next()  # )
                return [None] * n if tok == "Array" and isinstance(n, int) else None
            return {"true": True, "false": False, "null": None}.get(tok, self.env.get(tok))
        if tok == "{":
            obj = {}
            while self._peek() != "}":
                _, key = self._next()
                self._next()  # :
                obj[json.loads(key) if key.startswith('"') else key] = self.value()
                if self._peek() == ",":
                    self._next()
            self._next()
            return obj
        if tok == "[":
            arr = []
            while self._peek() != "]":
                arr.append(self.value())
                if self._peek() == ",":
                    self._next()
            self._next()
            return arr
        raise ValueError(f"非預期的符號 {tok!r}")


def nuxt_value(script: str, key: str):
    """取出 __NUXT__ 狀態中第一個 `key:` 之後的值（參數已代換）。"""
    m = re.search(r"window\.__NUXT__=\(function\(([^)]*)\)", script)
    if not m:
        return None
    params = m.group(1).split(",")
    args_at = script.rindex("}(") + 2
    reader = _Reader(script, args_at, {})
    args = []
    while reader._peek() != ")":
        args.append(reader.value())
        if reader._peek() == ",":
            reader._next()
    env = dict(zip(params, args))
    i = script.find(f"{key}:")
    if i < 0:
        return None
    return _Reader(script, i + len(key) + 1, env).value()


# ── 元大：https://www.yuantaetfs.com/product/detail/{代號}/ratio

def parse_yuanta(script: str) -> tuple[date | None, Rows]:
    fw = nuxt_value(script, "FundWeights") or {}
    trandate = str(nuxt_value(script, "trandate") or "")
    data_date = date(int(trandate[:4]), int(trandate[4:6]), int(trandate[6:8])) if re.fullmatch(r"\d{8}", trandate) else None
    rows: Rows = []

    def add(name, code, weight, qty):
        if weight is None or not name:
            return
        rows.append({
            "name": str(name).strip()[:120],
            "stock_id": None,
            "symbol": str(code).strip() if code else None,
            "weight": round(float(weight), 3),
            "shares": int(qty) if isinstance(qty, (int, float)) else None,
        })

    for s in fw.get("StockWeights") or []:
        add(s.get("name"), s.get("code"), s.get("weights"), s.get("qty"))
    for s in fw.get("ETFWeights") or []:
        add(s.get("name"), s.get("code"), s.get("weights"), s.get("qty"))
    for s in fw.get("FutureWeights") or []:
        add(f"{s.get('name')} {s.get('ym') or ''}".strip(), s.get("code"), s.get("weights"), s.get("qty"))
    for s in fw.get("BondWeights") or []:
        add(s.get("name"), s.get("code"), s.get("weights"), s.get("qty"))
    rows.sort(key=lambda r: -r["weight"])
    return (data_date, rows) if rows else (None, [])


async def fetch_yuanta(client: httpx.AsyncClient, etf_id: str) -> tuple[date | None, Rows]:
    r = await client.get(f"https://www.yuantaetfs.com/product/detail/{etf_id}/ratio")
    r.raise_for_status()
    return parse_yuanta(r.text)


# ── 群益：JSON API。ETF 代號 → 內部 fundNo 由 ETF 清單 API 自動對照（每次執行快取一次）

CAPITAL = "https://www.capitalfund.com.tw/CFWeb/api/etf"
_capital_ids: dict[str, str] | None = None


def capital_fund_ids(payload: dict) -> dict[str, str]:
    return {f["stockNo"]: f["fundNo"] for f in (payload.get("data") or {}).get("funds") or [] if f.get("stockNo")}


def _ymd(v: str | None) -> date | None:
    m = re.match(r"(\d{4})[-/](\d{1,2})[-/](\d{1,2})", v or "")
    return date(int(m[1]), int(m[2]), int(m[3])) if m else None


def parse_capital(payload: dict) -> tuple[date | None, Rows]:
    d = payload.get("data") or {}
    rows: Rows = []

    def add(name, code, weight, qty):
        if weight is None or not name:
            return
        rows.append({
            "name": str(name).strip()[:120], "stock_id": None, "symbol": str(code).strip() if code else None,
            "weight": round(float(weight), 3), "shares": int(qty) if isinstance(qty, (int, float)) else None,
        })

    for x in d.get("stocks") or []:
        add(x.get("stocName"), x.get("stocNo"), x.get("weight"), x.get("share"))
    for x in d.get("futures") or []:
        add(x.get("txDesc"), x.get("txEname"), x.get("weight"), x.get("lot"))
    for x in d.get("bonds") or []:
        add(x.get("bondName"), x.get("bondNo"), x.get("weight"), None)  # 債券為面額，不是股數
    if not rows:
        return None, []
    rows.sort(key=lambda r: -r["weight"])
    # pcf.date2 為清單對應的交易日；債券型沒有 pcf，退用清單日期 date1
    first = next((x for k in ("stocks", "bonds", "futures") for x in d.get(k) or []), {})
    data_date = _ymd((d.get("pcf") or {}).get("date2")) or _ymd(first.get("date1"))
    return data_date, rows


async def fetch_capital(client: httpx.AsyncClient, etf_id: str) -> tuple[date | None, Rows]:
    global _capital_ids
    if _capital_ids is None:
        r = await client.post(f"{CAPITAL}/list", json={})
        r.raise_for_status()
        _capital_ids = capital_fund_ids(r.json())
    fund_id = _capital_ids.get(etf_id)
    if not fund_id:
        raise LookupError(f"群益 ETF 清單查無 {etf_id}")
    r = await client.post(f"{CAPITAL}/buyback", json={"fundId": fund_id, "date": None})
    r.raise_for_status()
    return parse_capital(r.json())


# ── 國泰：cwapi.cathaysite.com.tw（Akamai 擋無瀏覽器標頭的請求）。FundCode 由 ETF 清單對照；
# 回應沒有資料日，SearchDate 從今天往回找第一個有資料的日子（非交易日回 4005）。

CATHAY = "https://cwapi.cathaysite.com.tw/api/ETF"
CATHAY_HEADERS = {"Origin": "https://www.cathaysite.com.tw", "Referer": "https://www.cathaysite.com.tw/", "Accept": "application/json"}
_cathay_ids: dict[str, str] | None = None


def cathay_fund_ids(payload: dict) -> dict[str, str]:
    return {f["stockCode"]: f["fundCode"] for f in payload.get("result") or [] if f.get("stockCode") and f.get("fundCode")}


def _num(v) -> float | None:
    try:
        return float(str(v).replace(",", "")) if v not in (None, "") else None
    except ValueError:
        return None


def parse_cathay(stocks: dict | None, bonds: dict | None, futures: dict | None) -> Rows:
    rows: Rows = []

    def add(name, code, weight, qty):
        w = _num(weight)
        if w is None or not name:
            return
        q = _num(qty)
        rows.append({"name": str(name).strip()[:120], "stock_id": None, "symbol": str(code).strip() if code else None,
                     "weight": round(w, 3), "shares": int(q) if q is not None else None})

    listed = lambda p: (p or {}).get("result") if isinstance((p or {}).get("result"), list) else []  # noqa: E731
    for x in listed(stocks):
        add(x.get("stockName"), x.get("stockCode"), x.get("weights"), x.get("volumn"))
    for x in listed(bonds):
        add(x.get("bondName"), x.get("bondNo"), x.get("ntMkval"), None)  # 債券為面額，不當股數
    for x in listed(futures):
        add(f"{x.get('ftName')} {x.get('ftDate') or ''}".strip(), x.get("ftNo"), x.get("ntMkval"), x.get("volumn"))
    rows.sort(key=lambda r: -r["weight"])
    return rows


async def fetch_cathay(client: httpx.AsyncClient, etf_id: str) -> tuple[date | None, Rows]:
    global _cathay_ids
    if _cathay_ids is None:
        r = await client.get(f"{CATHAY}/GetETFList", params={"CurrentPage": 1, "PerPageCount": 200}, headers=CATHAY_HEADERS)
        r.raise_for_status()
        _cathay_ids = cathay_fund_ids(r.json())
    code = _cathay_ids.get(etf_id)
    if not code:
        raise LookupError(f"國泰 ETF 清單查無 {etf_id}")
    day = date.today()
    for _ in range(8):
        if day.weekday() < 5:
            params = {"FundCode": code, "SearchDate": day.isoformat()}
            parts = []
            for api in ("GetETFDetailStockList", "GetETFDetailBondList", "GetETFDetailFutureList"):
                r = await client.get(f"{CATHAY}/{api}", params=params, headers=CATHAY_HEADERS)
                parts.append(r.json() if r.status_code == 200 else None)
            rows = parse_cathay(*parts)
            if rows:
                return day, rows
        day -= timedelta(days=1)
    return None, []


ISSUER_PARSERS: dict[str, tuple[str, Fetcher]] = {
    # 投信（stocks.issuer）→ (來源代碼, 抓取函式)
    "元大": ("yuanta", fetch_yuanta),
    "群益": ("capital", fetch_capital),
    "國泰": ("cathay", fetch_cathay),
}
