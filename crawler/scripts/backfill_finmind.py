"""FinMind 逐檔回補：股利（含除息日）、單季財報、月營收、資產負債表。

TWSE/TPEx OpenAPI 只有最新一期快照，多年歷史只能逐檔向 FinMind 查（CLAUDE.md：FinMind 補）。
- 依「任務 → 股票」順序跑：先把全市場股利補完（連續配息、殖利率），再補財報等。
- 股票依最新成交值排序，熱門股先有資料。
- 完成的 (任務, 股票) 記在 logs/backfill_finmind.done，中斷後直接重跑會續補。
- 限速：無 token 約 300 次/小時、有 FINMIND_TOKEN 約 600 次/小時。

  python scripts/backfill_finmind.py                          # 全部任務
  python scripts/backfill_finmind.py --datasets dividends     # 只補股利
"""

import argparse
import asyncio
import sys
from datetime import date
from pathlib import Path

from loguru import logger
from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import settings  # noqa: E402
from crawlers.fundamental.finmind import (  # noqa: E402
    fetch_balance_sheet, fetch_dividends, fetch_financials, fetch_revenue,
)
from db.connection import engine, get_session  # noqa: E402
from monitor.logger import setup_logger  # noqa: E402
from pipeline.notify import publisher  # noqa: E402

# 股利一次請求就含全部年度 → 起點拉長，連續配息年數才有意義；其餘補近 3 年 + 1 年（算年增率用）
_Y = date.today().year
DATASETS = {
    "dividends": (fetch_dividends, f"{_Y - 12}-01-01"),
    "financials": (fetch_financials, f"{_Y - 4}-01-01"),
    "revenue": (fetch_revenue, f"{_Y - 4}-01-01"),
    "balance_sheet": (fetch_balance_sheet, f"{_Y - 4}-01-01"),
}
DELAY = 6.2 if settings.finmind_token else 12.4  # 秒；對應 600 / 300 次每小時
QUOTA_BACKOFF = 1800
DONE_FILE = Path(__file__).resolve().parent.parent / "logs" / "backfill_finmind.done"


def _is_quota_error(msg: str) -> bool:
    m = msg.lower()
    return any(k in m for k in ("402", "429", "payment required", "level", "limit"))


async def _stocks_by_value() -> list[str]:
    async with get_session() as session:
        r = await session.execute(text(
            """
            SELECT s.id
            FROM stocks s
            LEFT JOIN LATERAL (
              SELECT q.value FROM daily_quotes q
              WHERE q.stock_id = s.id ORDER BY q.date DESC LIMIT 1
            ) q ON true
            WHERE s.is_active
            ORDER BY q.value DESC NULLS LAST, s.id
            """
        ))
        return [row[0] for row in r.fetchall()]


async def _run_one(fn, sid: str, start: str) -> bool:
    """成功回 True；非額度錯誤（查無資料等）回 False；額度用盡退避後重試，最多 3 次。"""
    for attempt in range(1, 4):
        try:
            await fn(sid, start)
            return True
        except Exception as e:
            msg = str(e)
            if not _is_quota_error(msg):
                logger.debug(f"{sid} 失敗：{msg[:80]}")
                return False
            logger.warning(f"FinMind 額度用盡 @ {sid}，退避 {QUOTA_BACKOFF}s（第 {attempt}/3 次）")
            await asyncio.sleep(QUOTA_BACKOFF)
    return False


async def main() -> None:
    parser = argparse.ArgumentParser(description="FinMind 逐檔回補")
    parser.add_argument("--datasets", default=",".join(DATASETS), help=f"逗號分隔：{', '.join(DATASETS)}")
    args = parser.parse_args()
    names = args.datasets.split(",")
    unknown = [n for n in names if n not in DATASETS]
    if unknown:
        parser.error(f"未知任務：{', '.join(unknown)}")

    setup_logger("INFO")
    DONE_FILE.parent.mkdir(exist_ok=True)
    done = set(DONE_FILE.read_text(encoding="utf-8").split()) if DONE_FILE.exists() else set()
    stocks = await _stocks_by_value()

    for name in names:
        fn, start = DATASETS[name]
        todo = [s for s in stocks if f"{name}:{s}" not in done]
        logger.info(f"[{name}] 起點 {start}，待補 {len(todo)} 檔，預估 {len(todo) * DELAY / 3600:.1f} 小時")
        ok = fail = 0
        for i, sid in enumerate(todo, 1):
            if await _run_one(fn, sid, start):
                ok += 1
                with DONE_FILE.open("a", encoding="utf-8") as f:
                    f.write(f"{name}:{sid}\n")
            else:
                fail += 1
            if i % 100 == 0:
                logger.info(f"[{name}] {i}/{len(todo)} 成功 {ok} 失敗 {fail}")
                await publisher.publish_done(f"finmind_{name}", count=ok)  # api 清快取，補好的先看得到
            await asyncio.sleep(DELAY)
        logger.success(f"[{name}] 完成：成功 {ok}，失敗 {fail}")
        await publisher.publish_done(f"finmind_{name}", count=ok)

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
