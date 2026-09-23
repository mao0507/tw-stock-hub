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
