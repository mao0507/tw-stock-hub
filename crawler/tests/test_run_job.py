import re
from pathlib import Path

import pytest

import run_job
from scheduler.jobs import JOBS

CRONTAB = Path(__file__).resolve().parent.parent / "crontab"


def test_every_crontab_job_is_registered():
    names = re.findall(r"run_job\.py (\S+)", CRONTAB.read_text(encoding="utf-8"))
    assert names, "crontab 沒有任何 job"
    missing = {n for n in names if n != "--pending"} - JOBS.keys()
    assert not missing, f"crontab 引用未註冊的 job：{missing}"


async def test_unknown_job_raises():
    with pytest.raises(ValueError, match="未知的 job"):
        await run_job.run_one("no_such_job")


async def test_successful_job_publishes_crawler_done_with_job_name(monkeypatch):
    calls = []

    async def fake_job():
        return 7

    async def fake_publish(name, crawl_date=None, count=0):
        calls.append((name, count))

    monkeypatch.setitem(JOBS, "exdividend", fake_job)
    monkeypatch.setattr(run_job.publisher, "publish_done", fake_publish)

    assert await run_job.run_one("exdividend") == 7
    assert calls == [("exdividend", 7)]


async def test_failed_job_does_not_publish(monkeypatch):
    calls = []

    async def failing_job():
        raise RuntimeError("boom")

    async def fake_publish(name, crawl_date=None, count=0):
        calls.append(name)

    monkeypatch.setitem(JOBS, "exdividend", failing_job)
    monkeypatch.setattr(run_job.publisher, "publish_done", fake_publish)

    with pytest.raises(RuntimeError):
        await run_job.run_one("exdividend")
    assert calls == []


def test_crawler_class_name_resolves_to_job():
    from scheduler.jobs import resolve_job
    assert resolve_job("TWSEDailyQuoteCrawler") == "twse_daily"
    assert resolve_job("twse_daily") == "twse_daily"
    assert resolve_job("NoSuchCrawler") is None


async def test_run_one_accepts_crawler_class_name(monkeypatch):
    calls = []

    async def fake_job():
        return 1

    async def fake_publish(name, crawl_date=None, count=0):
        calls.append(name)

    monkeypatch.setitem(JOBS, "twse_daily", fake_job)
    monkeypatch.setattr(run_job.publisher, "publish_done", fake_publish)
    assert await run_job.run_one("TWSEDailyQuoteCrawler") == 1
    # 通知一律用任務名稱，api 端依任務名稱分派
    assert calls == ["twse_daily"]
