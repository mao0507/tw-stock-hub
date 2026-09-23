"""全市場股利歷史(含除息日)回填 — 逐檔向 FinMind 抓。

FinMind 免費版需逐檔查詢且有流量限制 → 限速 + 失敗退避。
設 FINMIND_TOKEN 可提高額度。背景執行：

  uv run python scripts/backfill_dividends.py
"""

import asyncio
import sys
from pathlib import Path

from loguru import logger
from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from db.connection import get_session  # noqa: E402
from crawlers.fundamental.finmind import fetch_dividends  # noqa: E402
from monitor.logger import setup_logger  # noqa: E402

DELAY = 1.2          # 每檔間隔（秒）
BACKOFF = 90         # 觸發限制時退避（秒）
START = "2018-01-01"


async def _active_stocks() -> list[str]:
    async with get_session() as session:
        r = await session.execute(
            text("SELECT id FROM stocks WHERE is_active = true ORDER BY id")
        )
        return [row[0] for row in r.fetchall()]


async def main() -> None:
    setup_logger("INFO")
    stocks = await _active_stocks()
    total = len(stocks)
    logger.info(f"股利回填：{total} 檔，預估 {total * DELAY / 60:.0f} 分鐘起")

    ok = fail = 0
    for i, sid in enumerate(stocks, 1):
        try:
            n = await fetch_dividends(sid, START)
            ok += 1
            if i % 50 == 0:
                logger.info(f"進度 {i}/{total} 成功{ok} 失敗{fail}（最近 {sid}:{n}）")
        except Exception as e:
            msg = str(e)
            fail += 1
            if "level" in msg or "limit" in msg.lower() or "429" in msg:
                logger.warning(f"觸發限制，退避 {BACKOFF}s @ {sid}")
                await asyncio.sleep(BACKOFF)
            else:
                logger.debug(f"{sid} 失敗: {msg[:60]}")
        await asyncio.sleep(DELAY)

    logger.success(f"股利回填完成：成功 {ok}，失敗 {fail}")


if __name__ == "__main__":
    asyncio.run(main())
