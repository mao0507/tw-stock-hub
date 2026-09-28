"""ETF 成分與基本資料（來源：MoneyDJ ETF 頁，單一格式覆蓋全 ETF；第三方網站，逐檔限速）。

- etf_holdings（每日）：成分表含資料日期，只有資料日期比 DB 最新一期新才寫入，保存每期歷史。
  有投信官網 parser 的 ETF（etf_issuers.ISSUER_PARSERS）用官網每日資料，官網失敗才退回 MoneyDJ。
  台股成分附代號（2330.TW／.TWO）；海外股保留原始代號（NVDA.US）；債券、期貨、現金沒有代號。
- etf_refresh（每週）：基本資料頁 → etf_profiles（追蹤指數若 TWSE 已提供則不覆蓋）。
"""

import asyncio
import random
import re
from datetime import date

import httpx
from bs4 import BeautifulSoup
from loguru import logger
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert

from config import settings
from db.connection import get_session
from crawlers.fundamental.etf_issuers import ISSUER_PARSERS, Fetcher
from db.models import ETFConstituentModel, ETFProfileModel, StockModel

URL = "https://www.moneydj.com/etf/x/Basic/Basic0007b.xdjhtm"
INFO_URL = "https://www.moneydj.com/etf/x/Basic/Basic0004.xdjhtm"
SOURCE = "moneydj"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
}


def _num(s: str) -> float | None:
    s = re.sub(r"[^\d.-]", "", s or "")
    try:
        return float(s) if s else None
    except ValueError:
        return None


def parse_holdings(html: str) -> tuple[date | None, list[dict]]:
    """解析 MoneyDJ 成分頁 → (資料日期, [{name, stock_id, symbol, weight, shares}])。"""
    soup = BeautifulSoup(html, "lxml")
    m = re.search(r"資料日期[：:]\s*(\d{4})/(\d{2})/(\d{2})", soup.get_text(" ", strip=True))
    data_date = date(int(m[1]), int(m[2]), int(m[3])) if m else None
    out: list[dict] = []
    for tbl in soup.find_all("table"):
        if "投資比例" not in tbl.get_text():
            continue
        for tr in tbl.find_all("tr"):
            cells = [td.get_text(strip=True) for td in tr.find_all("td")]
            if len(cells) < 2:
                continue
            weight = _num(cells[1])
            if weight is None:
                continue
            # 「台積電(2330.TW)」「NVIDIA(NVDA.US)」「臺股期貨 202610(FITXN*1.TF)」；債券名稱本身可能含括號，只認結尾的「(代號.市場)」
            cm = re.fullmatch(r"(.+?)\(([^()\s]+\.[A-Z]{2,3})\)", cells[0])
            name, symbol = (cm[1].strip(), cm[2]) if cm else (cells[0], None)
            tw = re.fullmatch(r"([0-9A-Z]+)\.(?:TW|TWO)", symbol or "")
            shares = _num(cells[2]) if len(cells) > 2 else None
            out.append({
                "name": name[:120],
                "stock_id": tw[1] if tw else None,
                "symbol": symbol,
                "weight": round(weight, 3),
                "shares": int(shares) if shares is not None else None,
            })
        if out:
            break
    return (data_date, out) if out else (None, [])


def plan_records(etf_id: str, data_date: date | None, rows: list[dict], latest: date | None, source: str) -> list[dict]:
    """資料日期比 DB 最新一期新才寫；同名成分合併權重與股數。"""
    if data_date is None or (latest is not None and data_date <= latest):
        return []
    merged: dict[str, dict] = {}
    for r in rows:
        cur = merged.get(r["name"])
        if cur:
            cur["weight"] = round(cur["weight"] + r["weight"], 3)
            if r["shares"] is not None:
                cur["shares"] = (cur["shares"] or 0) + r["shares"]
            continue
        merged[r["name"]] = {
            "etf_id": etf_id, "data_date": data_date, "holding_name": r["name"], "stock_id": r["stock_id"],
            "symbol": r["symbol"], "weight": r["weight"], "shares": r["shares"], "source": source,
        }
    return list(merged.values())


def _date(v: str | None) -> date | None:
    m = re.search(r"(\d{4})/(\d{2})/(\d{2})", v or "")
    return date(int(m[1]), int(m[2]), int(m[3])) if m else None


def parse_profile(html: str) -> dict | None:
    """解析 MoneyDJ 基本資料頁（欄位成對出現：[標籤, 值, 標籤, 值]）→ etf_profiles 欄位。"""
    soup = BeautifulSoup(html, "lxml")
    raw: dict[str, str] = {}
    for tr in soup.find_all("tr"):
        cells = [td.get_text(" ", strip=True) for td in tr.find_all(["td", "th"])]
        for i in range(0, len(cells) - 1, 2):
            if cells[i] and len(cells[i]) <= 12:
                raw.setdefault(cells[i], cells[i + 1])
    if "ETF名稱" not in raw:
        return None
    aum = raw.get("ETF規模", "")
    aum_m = re.match(r"([\d,.]+)", aum)
    count = _num(raw.get("成分股數", ""))
    text = lambda k: raw.get(k) or None  # noqa: E731
    return {
        "inception_date": _date(raw.get("成立日期")),
        "listing_date": _date(raw.get("上市日期")),
        "aum_million": _num(aum_m[1]) if aum_m else None,
        "aum_date": _date(aum.split("(", 2)[-1] if aum.count("(") >= 2 else None),
        "currency": text("計價幣別"),
        "holdings_count": int(count) if count is not None else None,
        "asset_class": text("投資標的"),
        "region": text("投資區域"),
        "dividend_frequency": text("配息頻率"),
        "management_fee": _num(raw.get("經理費(%)", "")),
        "total_expense": _num(raw.get("總管理費用(%)", "").split("(")[0]),
        "custodian": text("保管機構"),
        "tracking_index": text("追蹤指數"),
        "website": (text("官方網站連結") or "")[:300] or None,
    }


def pick_source(issuer: str | None) -> tuple[str, Fetcher] | None:
    """有官網 parser 的投信回 (來源代碼, 抓取函式)，否則 None（用 MoneyDJ）。"""
    return ISSUER_PARSERS.get(issuer or "")


def assign_stock_ids(rows: list[dict], known_ids: set[str]) -> list[dict]:
    """官網只給原始代號：代號是已知台股才填 stock_id（海外、期貨、債券代號不會對到）。"""
    return [{**r, "stock_id": r["stock_id"] or (r["symbol"] if r["symbol"] in known_ids else None)} for r in rows]


async def _etfs() -> list[tuple[str, str, str | None]]:
    async with get_session() as session:
        rows = await session.execute(
            select(StockModel.id, StockModel.security_type, StockModel.issuer)
            .where(StockModel.security_type != "stock", StockModel.is_active.is_(True))
            .order_by(StockModel.id)
        )
        return [(r[0], r[1], r[2]) for r in rows.all()]


async def _stock_ids() -> set[str]:
    async with get_session() as session:
        return {r[0] for r in (await session.execute(select(StockModel.id))).all()}


async def _sleep() -> None:
    await asyncio.sleep(random.uniform(settings.request_delay_min, settings.request_delay_max))


async def _moneydj(client: httpx.AsyncClient, etf_id: str) -> tuple[date | None, list[dict]]:
    r = await client.get(URL, params={"etfid": f"{etf_id}.TW"})
    r.raise_for_status()
    return parse_holdings(r.text)


async def fetch_holdings(
    client: httpx.AsyncClient, etf_id: str, security_type: str, issuer: str | None = None, known_ids: set[str] | None = None,
) -> int:
    source, data_date, rows = SOURCE, None, []
    official = pick_source(issuer)
    if official:
        try:
            data_date, rows = await official[1](client, etf_id)
            rows = assign_stock_ids(rows, known_ids or set())
            source = official[0]
        except Exception as e:
            logger.warning(f"[ETF成分] {etf_id} 官網（{official[0]}）失敗，改用 MoneyDJ: {e}")
            rows = []
        if not rows:
            source = SOURCE
    if not rows:
        data_date, rows = await _moneydj(client, etf_id)
    if not rows:
        logger.warning(f"[ETF成分] {etf_id} 無成分資料")
        return 0
    if security_type == "etf_equity":
        no_code = [x["name"] for x in rows if not x["stock_id"] and not x["symbol"]]
        if no_code:
            logger.warning(f"[ETF成分] {etf_id} 國內股票型有無代號成分：{no_code[:10]}")
    async with get_session() as session:
        latest = (await session.execute(
            select(func.max(ETFConstituentModel.data_date)).where(ETFConstituentModel.etf_id == etf_id)
        )).scalar()
        records = plan_records(etf_id, data_date, rows, latest, source)
        if records:
            await session.execute(insert(ETFConstituentModel.__table__).values(records).on_conflict_do_nothing())
    return len(records)


async def refresh_holdings() -> int:
    """每日：全部 ETF 成分（資料日期有變才寫）。"""
    total = written = 0
    async with httpx.AsyncClient(timeout=30, verify=False, follow_redirects=True, headers=HEADERS) as c:
        known = await _stock_ids()
        for etf_id, kind, issuer in await _etfs():
            try:
                n = await fetch_holdings(c, etf_id, kind, issuer, known)
                total += n
                written += 1 if n else 0
            except Exception as e:
                logger.error(f"[ETF成分] {etf_id} 失敗: {e}")
            await _sleep()
    logger.info(f"[ETF成分] {written} 檔有新一期，共 {total} 筆")
    return total


async def refresh_all_known_etfs() -> int:
    """每週：全部 ETF 基本資料 → etf_profiles。"""
    count = 0
    async with httpx.AsyncClient(timeout=30, verify=False, follow_redirects=True, headers=HEADERS) as c:
        for etf_id, _, _ in await _etfs():
            try:
                ri = await c.get(INFO_URL, params={"etfid": f"{etf_id}.TW"})
                profile = parse_profile(ri.text)
                if profile:
                    table = ETFProfileModel.__table__
                    stmt = insert(table).values(etf_id=etf_id, **profile)
                    fields = {k: stmt.excluded[k] for k in profile if k != "tracking_index"}
                    # 追蹤指數以 TWSE 官方為準（etf_types 寫入），MoneyDJ 只補空值
                    fields["tracking_index"] = func.coalesce(table.c.tracking_index, stmt.excluded.tracking_index)
                    fields["updated_at"] = func.now()
                    async with get_session() as session:
                        await session.execute(stmt.on_conflict_do_update(index_elements=["etf_id"], set_=fields))
                    count += 1
            except Exception as e:
                logger.error(f"[ETF基本資料] {etf_id} 失敗: {e}")
            await _sleep()
    logger.info(f"[ETF基本資料] 更新 {count} 檔")
    return count
