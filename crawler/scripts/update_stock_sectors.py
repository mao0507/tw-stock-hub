"""更新 stocks.sector 為對應的「類指數」名稱（供熱力圖點擊下鑽成份股）。

來源：TWSE 上市公司基本資料 OpenAPI（t187ap03_L，「產業別」）與 TPEx 上櫃公司基本資料（mopsfin_t187ap03_O，
SecuritiesIndustryCode），兩者產業代號同一套。
產業別代號 → sector_performance 的類指數名稱。產業變動少，需要時手動跑即可。

  uv run python scripts/update_stock_sectors.py
"""

import asyncio
import sys
from pathlib import Path

import httpx
from loguru import logger
from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from db.connection import get_session  # noqa: E402

TWSE_API = "https://openapi.twse.com.tw/v1/opendata/t187ap03_L"
TPEX_API = "https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O"

# TWSE 產業別代號 → 類指數名稱（對齊 sector_performance.sector_name）
INDUSTRY_CODE_TO_INDEX = {
    "01": "水泥類指數",
    "02": "食品類指數",
    "03": "塑膠類指數",
    "04": "紡織纖維類指數",
    "05": "電機機械類指數",
    "06": "電器電纜類指數",
    "08": "玻璃陶瓷類指數",
    "09": "造紙類指數",
    "10": "鋼鐵類指數",
    "11": "橡膠類指數",
    "12": "汽車類指數",
    "14": "建材營造類指數",
    "15": "航運類指數",
    "16": "觀光餐旅類指數",
    "17": "金融保險類指數",
    "18": "貿易百貨類指數",
    "20": "其他類指數",
    "21": "化學類指數",
    "22": "生技醫療類指數",
    "23": "油電燃氣類指數",
    "24": "半導體類指數",
    "25": "電腦及週邊設備類指數",
    "26": "光電類指數",
    "27": "通信網路類指數",
    "28": "電子零組件類指數",
    "29": "電子通路類指數",
    "30": "資訊服務類指數",
    "31": "其他電子類指數",
    # 以下僅上櫃有
    "32": "文化創意類指數",
    "33": "農業科技類指數",
    "34": "電子商務類指數",
    "35": "綠能環保類指數",
    "36": "數位雲端類指數",
    "37": "運動休閒類指數",
    "38": "居家生活類指數",
}


async def main() -> None:
    updates = []
    for url, id_key, code_key, label in [
        (TWSE_API, "公司代號", "產業別", "上市"),
        (TPEX_API, "SecuritiesCompanyCode", "SecuritiesIndustryCode", "上櫃"),
    ]:
        resp = httpx.get(url, timeout=30, verify=False)
        resp.raise_for_status()
        companies = resp.json()
        logger.info(f"取得 {len(companies)} 家{label}公司")
        for c in companies:
            stock_id = str(c.get(id_key, "")).strip()
            index_name = INDUSTRY_CODE_TO_INDEX.get(str(c.get(code_key, "")).strip())
            if stock_id and index_name:
                updates.append({"id": stock_id, "sector": index_name})

    async with get_session() as session:
        for u in updates:
            await session.execute(
                text("UPDATE stocks SET sector = :sector WHERE id = :id"),
                u,
            )
    logger.success(f"更新 {len(updates)} 檔股票 sector")


if __name__ == "__main__":
    asyncio.run(main())
