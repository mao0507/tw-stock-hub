"""全市場估值(PE/PB/殖利率)歷史回填 — 逐檔向 FinMind 抓（TaiwanStockPER，免費額度可用）。

valuations 表原本只靠 ValuationCrawler 每日快照累積，只有短短幾天資料，
個股頁 PE 河流圖與 AI 評分的估值子項都需要較長歷史才有意義。

FinMind 免費版需逐檔查詢且有流量限制 → 限速 + 失敗退避。
設 FINMIND_TOKEN 可提高額度。背景執行：

  uv run python scripts/backfill_valuations.py
"""

import asyncio
import sys
from datetime import date
from pathlib import Path

from loguru import logger
from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import settings  # noqa: E402
from db.connection import get_session  # noqa: E402
from crawlers.fundamental.finmind import fetch_valuation  # noqa: E402
from monitor.logger import setup_logger  # noqa: E402

# 有 FINMIND_TOKEN（600 次/小時方案）→ 3600/600=6s，抓安全邊際用 6.2s；
# 無 token（免費匿名額度更低）→ 沿用原本 1.2s，跑到額度用盡時交給下面的退避重試處理。
DELAY = 6.2 if settings.finmind_token else 1.2
QUOTA_BACKOFF = 1800  # 額度用盡（402/429）退避（秒，FinMind 免費額度通常以小時計，90s 不夠）
MAX_QUOTA_RETRIES = 3  # 同一檔因額度問題最多重試幾次（超過才視為失敗跳過，避免卡死整支腳本）
START = "2021-07-01"  # 對齊 daily_quotes 等表的目標回補起點（近 5 年）
RESUME_CUTOFF = "2021-08-01"  # 已有此日期(含)以前資料 → 視為已回填過，跳過（容忍上市較晚等個別差異）


def _is_quota_error(msg: str) -> bool:
    m = msg.lower()
    return "402" in m or "429" in m or "payment required" in m or "level" in m or "limit" in m


async def _active_stocks() -> list[str]:
    """回未回填過的股票，支援腳本中斷後直接重跑續補（已有早期資料的股票會被跳過）。"""
    async with get_session() as session:
        r = await session.execute(text(
            """
            SELECT s.id FROM stocks s
            WHERE s.is_active = true
              AND NOT EXISTS (
                SELECT 1 FROM valuations v
                WHERE v.stock_id = s.id AND v.date <= :cutoff
              )
            ORDER BY s.id
            """
        ), {"cutoff": date.fromisoformat(RESUME_CUTOFF)})
        return [row[0] for row in r.fetchall()]


async def main() -> None:
    setup_logger("INFO")
    stocks = await _active_stocks()
    total = len(stocks)
    logger.info(f"估值回填：{total} 檔，預估 {total * DELAY / 60:.0f} 分鐘起")

    ok = fail = 0
    for i, sid in enumerate(stocks, 1):
        quota_retries = 0
        while True:
            try:
                n = await fetch_valuation(sid, START)
                ok += 1
                if i % 50 == 0:
                    logger.info(f"進度 {i}/{total} 成功{ok} 失敗{fail}（最近 {sid}:{n}）")
                break
            except Exception as e:
                msg = str(e)
                if _is_quota_error(msg):
                    quota_retries += 1
                    if quota_retries > MAX_QUOTA_RETRIES:
                        logger.warning(f"{sid} 額度重試 {MAX_QUOTA_RETRIES} 次仍失敗，跳過")
                        fail += 1
                        break
                    logger.warning(
                        f"額度用盡，退避 {QUOTA_BACKOFF}s 後重試同一檔 {sid}"
                        f"（第 {quota_retries}/{MAX_QUOTA_RETRIES} 次）"
                    )
                    await asyncio.sleep(QUOTA_BACKOFF)
                    continue
                fail += 1
                logger.debug(f"{sid} 失敗: {msg[:60]}")
                break
        await asyncio.sleep(DELAY)

    logger.success(f"估值回填完成：成功 {ok}，失敗 {fail}")


if __name__ == "__main__":
    asyncio.run(main())
