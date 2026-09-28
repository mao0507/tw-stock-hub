"""ETF 成分與基本資料（來源：MoneyDJ ETF 頁，單一格式覆蓋全 ETF；第三方網站，逐檔限速）。

- etf_holdings（每日）：成分表含資料日期，只有資料日期比 DB 最新一期新才寫入，保存每期歷史。
  台股成分附代號（2330.TW／.TWO）；海外股保留原始代號（NVDA.US）；債券、期貨、現金沒有代號。
- etf_refresh（每週）：基本資料頁。
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
from db.models import ETFConstituentModel, StockModel
from pipeline.writer import DataWriter

URL = "https://www.moneydj.com/etf/x/Basic/Basic0007b.xdjhtm"
INFO_URL = "https://www.moneydj.com/etf/x/Basic/Basic0004.xdjhtm"
SOURCE = "moneydj"

# 基本資料欄位白名單（key 子字串 → 顯示標籤），保序
INFO_FIELDS = [
    ("基金名稱", "全名"), ("全名", "全名"),
    ("發行公司", "發行公司"),
    ("追蹤指數", "追蹤指數"),
    ("計價幣別", "計價幣別"),
    ("投資地區", "投資地區"),
    ("成立日", "成立日"),
    ("ETF規模", "資產規模"), ("資產規模", "資產規模"),
    ("經理費", "經理費率"),
    ("總管理費用", "總管理費"), ("保管費", "保管費率"),
    ("經理人", "經理人"),
    ("官方網站", "官方網站"), ("網站", "官方網站"),
]
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


def parse_info(html: str) -> list[list[str]]:
    """解析基本資料 → 保序 [[label, value], ...]，過濾導覽雜訊。"""
    soup = BeautifulSoup(html, "lxml")
    raw: dict[str, str] = {}
    for tbl in soup.find_all("table"):
        for tr in tbl.find_all("tr"):
            cells = [td.get_text(strip=True) for td in tr.find_all(["td", "th"])]
            for i in range(0, len(cells) - 1, 2):
                k, v = cells[i], cells[i + 1]
                if k and v and len(k) <= 12 and len(v) <= 80:
                    raw.setdefault(k, v)
    out: list[list[str]] = []
    seen: set[str] = set()
    for key_sub, label in INFO_FIELDS:
        if label in seen:
            continue
        for k, v in raw.items():
            if key_sub in k:
                out.append([label, v])
                seen.add(label)
                break
    return out


async def _etfs() -> list[tuple[str, str]]:
    async with get_session() as session:
        rows = await session.execute(
            select(StockModel.id, StockModel.security_type)
            .where(StockModel.security_type != "stock", StockModel.is_active.is_(True))
            .order_by(StockModel.id)
        )
        return [(r[0], r[1]) for r in rows.all()]


async def _sleep() -> None:
    await asyncio.sleep(random.uniform(settings.request_delay_min, settings.request_delay_max))


async def fetch_holdings(client: httpx.AsyncClient, etf_id: str, security_type: str) -> int:
    r = await client.get(URL, params={"etfid": f"{etf_id}.TW"})
    r.raise_for_status()
    data_date, rows = parse_holdings(r.text)
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
        records = plan_records(etf_id, data_date, rows, latest, SOURCE)
        if records:
            await session.execute(insert(ETFConstituentModel.__table__).values(records).on_conflict_do_nothing())
    return len(records)


async def refresh_holdings() -> int:
    """每日：全部 ETF 成分（資料日期有變才寫）。"""
    total = written = 0
    async with httpx.AsyncClient(timeout=30, verify=False, follow_redirects=True, headers=HEADERS) as c:
        for etf_id, kind in await _etfs():
            try:
                n = await fetch_holdings(c, etf_id, kind)
                total += n
                written += 1 if n else 0
            except Exception as e:
                logger.error(f"[ETF成分] {etf_id} 失敗: {e}")
            await _sleep()
    logger.info(f"[ETF成分] {written} 檔有新一期，共 {total} 筆")
    return total


async def refresh_all_known_etfs() -> int:
    """每週：全部 ETF 基本資料。"""
    today = date.today()
    count = 0
    async with httpx.AsyncClient(timeout=30, verify=False, follow_redirects=True, headers=HEADERS) as c:
        for etf_id, _ in await _etfs():
            try:
                ri = await c.get(INFO_URL, params={"etfid": f"{etf_id}.TW"})
                info = parse_info(ri.text)
                if info:
                    await DataWriter.write_etf_info(etf_id, info, today)
                    count += 1
            except Exception as e:
                logger.error(f"[ETF基本資料] {etf_id} 失敗: {e}")
            await _sleep()
    logger.info(f"[ETF基本資料] 更新 {count} 檔")
    return count
