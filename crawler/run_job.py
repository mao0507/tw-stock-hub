"""一次性任務入口，由 supercronic 呼叫，跑完即結束以釋放記憶體。

用法：
  python run_job.py <job>      執行單一任務
  python run_job.py --pending  執行 stocks.pending_jobs 中待處理的手動觸發任務
"""

import asyncio
import sys

from loguru import logger
from sqlalchemy import text

from config import settings
from db.connection import engine, get_session
from monitor.logger import setup_logger
from pipeline.notify import publisher
from scheduler.jobs import JOBS

# 先把一筆 pending 改成 running 再執行，避免兩次輪詢重複撿到同一筆
CLAIM_SQL = text("""
    UPDATE pending_jobs SET status = 'running', started_at = NOW()
    WHERE id = (
        SELECT id FROM pending_jobs WHERE status = 'pending'
        ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED
    )
    RETURNING id, job_name
""")
FINISH_SQL = text("""
    UPDATE pending_jobs SET status = :status, finished_at = NOW(), result = :result
    WHERE id = :id
""")


async def run_one(name: str) -> int | None:
    job = JOBS.get(name)
    if job is None:
        raise ValueError(f"未知的 job: {name}（可用：{', '.join(sorted(JOBS))}）")
    count = await job()
    # 以任務名稱統一通知 api（清快取、除權息後重算股利等）；個別爬蟲自發的通知保留，重複無害
    await publisher.publish_done(name, count=count or 0)
    return count


async def run_pending() -> None:
    while True:
        async with get_session() as session:
            row = (await session.execute(CLAIM_SQL)).first()
        if row is None:
            return
        job_id, name = row
        try:
            count = await run_one(name)
            status, result = "success", f"count={count}"
        except Exception as e:
            logger.exception(f"[pending] {name} failed")
            status, result = "failed", str(e)[:1000]
        async with get_session() as session:
            await session.execute(FINISH_SQL, {"id": job_id, "status": status, "result": result})


async def main(argv: list[str]) -> int:
    setup_logger(settings.log_level)
    if len(argv) != 1:
        print(__doc__)
        return 2
    try:
        if argv[0] == "--pending":
            await run_pending()
        else:
            await run_one(argv[0])
        return 0
    except Exception:
        logger.exception(f"[run_job] {argv[0]} failed")
        return 1
    finally:
        await engine.dispose()


if __name__ == "__main__":
    sys.exit(asyncio.run(main(sys.argv[1:])))
