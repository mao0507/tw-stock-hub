"""投信官網 ETF 每日成分（#45）。每家投信一個 parser，都回傳 (資料日期, rows)，rows 格式同 MoneyDJ：
{name, stock_id(None，寫入時再以 stocks 表比對), symbol, weight, shares}。

ISSUER_PARSERS：投信名稱（stocks.issuer）→ 抓取函式。有 parser 的投信其 ETF 一律用官網資料，MoneyDJ 只補其他。
"""

import json
import re
from collections.abc import Awaitable, Callable
from datetime import date

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


ISSUER_PARSERS: dict[str, tuple[str, Fetcher]] = {
    # 投信（stocks.issuer）→ (來源代碼, 抓取函式)
    "元大": ("yuanta", fetch_yuanta),
}
