"""證券類型與 ETF 發行投信（來源：TWSE OpenAPI t187ap47_L 基金基本資料）。

上市 ETF 依官方「基金類型」判定；上櫃 ETF 不在該資料集，依代號後綴判定（B 債券、L／R 槓桿反向）。
非 00 開頭一律視為個股。
"""

import httpx
from loguru import logger
from sqlalchemy import select, update

from db.connection import get_session
from db.models import StockModel

URL = "https://openapi.twse.com.tw/v1/opendata/t187ap47_L"

# 投信名稱（以基金中文名稱開頭比對；長的放前面避免「華南」吃掉「華南永昌」這類情況）
ISSUERS = sorted([
    "元大", "富邦", "國泰", "中國信託", "中信", "群益", "台新", "復華", "野村", "兆豐", "凱基", "統一",
    "第一金", "永豐", "新光", "安聯", "街口", "富蘭克林華美", "大華銀", "玉山", "貝萊德", "摩根", "聯博",
    "華南永昌", "國票", "保德信", "聯邦", "瀚亞", "路博邁", "柏瑞", "台灣人壽", "合庫", "日盛", "宏利", "施羅德", "華頓", "大華", "FT",
], key=len, reverse=True)
ISSUER_ALIAS = {"中國信託": "中信", "大華": "大華銀", "FT": "富蘭克林華美"}


def issuer_of(fund_name: str | None) -> str | None:
    # 主動式、平衡型 ETF 簡稱以「主動」「平衡」開頭
    text = (fund_name or "").removeprefix("主動").removeprefix("平衡")
    for name in ISSUERS:
        if text.startswith(name):
            return ISSUER_ALIAS.get(name, name)
    return None


def classify(code: str, fund_type: str | None) -> str:
    if not code.startswith("00"):
        return "stock"
    if code.endswith("B"):
        return "etf_bond"
    if code.endswith(("L", "R")):
        return "etf_leveraged"
    t = fund_type or ""
    if "槓桿" in t or "反向" in t:
        return "etf_leveraged"
    if "債券" in t:
        return "etf_bond"
    if "期貨" in t:
        return "etf_other"
    if "國內成分" in t:
        return "etf_equity"
    if "國外" in t or "連結式" in t or "境外" in t:
        return "etf_foreign"
    return "etf_other"


def resolve_types(stocks: list[tuple[str, str]], rows: list[dict]) -> list[dict]:
    """stocks：[(代號, 簡稱)]；rows：t187ap47_L 原始列。回每檔的類型與投信（上櫃不在官方資料，投信改由簡稱判斷）。"""
    by_code = {r.get("基金代號", "").strip(): r for r in rows}
    out = []
    for code, name in stocks:
        r = by_code.get(code)
        kind = classify(code, r.get("基金類型") if r else None)
        out.append({
            "id": code,
            "security_type": kind,
            "issuer": None if kind == "stock" else issuer_of(r.get("基金中文名稱") if r else name),
        })
    return out


async def refresh_security_types() -> int:
    async with httpx.AsyncClient(timeout=30, verify=False) as c:
        r = await c.get(URL)
        r.raise_for_status()
        rows = r.json()
    async with get_session() as session:
        stocks = [(s.id, s.name) for s in (await session.execute(select(StockModel.id, StockModel.name))).all()]
        resolved = resolve_types(stocks, rows)
        for item in resolved:
            await session.execute(
                update(StockModel).where(StockModel.id == item["id"])
                .values(security_type=item["security_type"], issuer=item["issuer"])
            )
    etfs = [x for x in resolved if x["security_type"] != "stock"]
    unknown = [x["id"] for x in etfs if x["issuer"] is None]
    if unknown:
        logger.warning(f"[ETF類型] 無法判定投信：{unknown}")
    logger.info(f"[ETF類型] {len(etfs)} 檔 ETF、{len(resolved) - len(etfs)} 檔個股")
    return len(etfs)
