"""ETF 成分股 + 權重（來源：MoneyDJ ETF 基本資料頁，單一格式覆蓋全 ETF）。

逐檔查詢，採 on-demand（看 ETF 個股頁時補）。
"""

import asyncio
import random
import re
from datetime import date

import httpx
from bs4 import BeautifulSoup
from loguru import logger
from sqlalchemy import select

from config import settings
from db.connection import get_session
from db.models import StockModel
from pipeline.writer import DataWriter

URL = "https://www.moneydj.com/etf/x/Basic/Basic0007b.xdjhtm"
INFO_URL = "https://www.moneydj.com/etf/x/Basic/Basic0004.xdjhtm"

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


def parse_holdings(html: str) -> list[dict]:
    """解析 MoneyDJ 成分表 → [{stock_id, stock_name, weight, shares}]。"""
    soup = BeautifulSoup(html, "lxml")
    out: list[dict] = []
    for tbl in soup.find_all("table"):
        head = tbl.get_text()
        if "投資比例" not in head and "權重" not in head:
            continue
        for tr in tbl.find_all("tr"):
            cells = [td.get_text(strip=True) for td in tr.find_all(["td", "th"])]
            if len(cells) < 2:
                continue
            # cells[0] = '台積電(2330.TW)'
            m = re.search(r"\(([0-9A-Z]+)\.(?:TW|TWO)\)", cells[0])
            if not m:
                continue
            name = cells[0].split("(")[0].strip()
            weight = _num(cells[1])
            shares = _num(cells[2]) if len(cells) > 2 else None
            if weight is None:
                continue
            out.append({
                "stock_id": m.group(1),
                "stock_name": name[:50],
                "weight": round(weight, 2),
                "shares": int(shares) if shares is not None else None,
            })
        if out:
            break
    return out


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


async def fetch_etf_holdings(etf_id: str) -> int:
    today = date.today()
    async with httpx.AsyncClient(timeout=30, verify=False, follow_redirects=True, headers=HEADERS) as c:
        r = await c.get(URL, params={"etfid": f"{etf_id}.TW"})
        r.raise_for_status()
        holdings = parse_holdings(r.text)
        try:
            ri = await c.get(INFO_URL, params={"etfid": f"{etf_id}.TW"})
            info = parse_info(ri.text)
            if info:
                await DataWriter.write_etf_info(etf_id, info, today)
        except Exception as e:
            logger.warning(f"[ETF] {etf_id} 基本資料失敗: {e}")

    if not holdings:
        logger.warning(f"[ETF] {etf_id} 無成分資料")
        return 0

    records = [{"etf_id": etf_id, "updated_date": today, **h} for h in holdings]
    count = await DataWriter.write_etf_holdings(etf_id, records)
    logger.info(f"[ETF] {etf_id}: {count} 成分股 + 基本資料")
    return count


async def refresh_all_known_etfs() -> int:
    """週排程用：枚舉已知 ETF（代號開頭 00 且 is_active）逐檔補資料。"""
    async with get_session() as session:
        rows = await session.execute(
            select(StockModel.id).where(StockModel.id.like("00%"), StockModel.is_active.is_(True))
        )
        etf_ids = [r[0] for r in rows.all()]

    total = 0
    for etf_id in etf_ids:
        try:
            total += await fetch_etf_holdings(etf_id)
        except Exception as e:
            logger.error(f"[ETF] {etf_id} 週更失敗: {e}")
        await asyncio.sleep(random.uniform(settings.request_delay_min, settings.request_delay_max))
    logger.info(f"[ETF] 週更完成，共 {len(etf_ids)} 檔、{total} 筆成分股")
    return total


def _selfcheck() -> None:
    sample = (
        "<table><tr><th>個股名稱</th><th>投資比例(%)</th><th>持有股數</th></tr>"
        "<tr><td>台積電(2330.TW)</td><td>57.72</td><td>520,512,559</td></tr>"
        "<tr><td>聯發科(2454.TW)</td><td>5.79</td><td>31,487,629</td></tr></table>"
    )
    h = parse_holdings(sample)
    assert h[0] == {"stock_id": "2330", "stock_name": "台積電", "weight": 57.72, "shares": 520512559}, h
    assert h[1]["stock_id"] == "2454", h
    print("etf parse self-check ok")


if __name__ == "__main__":
    _selfcheck()
