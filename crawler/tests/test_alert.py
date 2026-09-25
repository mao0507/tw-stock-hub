from monitor.alert import AlertManager, consecutive_failures


def make(threshold, statuses):
    """statuses：該爬蟲最近的執行結果（新到舊，已含本次失敗）"""
    async def load(_name, _limit):
        return statuses
    manager = AlertManager(threshold=threshold, load_recent_statuses=load)
    triggered = []
    manager._trigger_alert = lambda name, error, count: triggered.append((name, count))
    return manager, triggered


def test_consecutive_failures_counts_leading_failed():
    assert consecutive_failures(["failed", "failed", "success", "failed"]) == 2
    assert consecutive_failures(["success", "failed"]) == 0
    assert consecutive_failures([]) == 0


async def test_below_threshold_does_not_alert():
    manager, triggered = make(3, ["failed", "failed", "success"])
    await manager.record_failure("twse_daily", "boom")
    assert triggered == []


async def test_alerts_when_reaching_threshold_exactly():
    manager, triggered = make(3, ["failed", "failed", "failed", "success"])
    await manager.record_failure("twse_daily", "boom")
    assert triggered == [("twse_daily", 3)]


async def test_does_not_repeat_after_threshold_in_same_incident():
    # 已連續失敗 4 次：第 3 次時已告警過
    manager, triggered = make(3, ["failed", "failed", "failed", "failed"])
    await manager.record_failure("twse_daily", "boom")
    assert triggered == []


async def test_counter_resets_after_success():
    manager, triggered = make(2, ["failed", "success", "failed", "failed"])
    await manager.record_failure("twse_daily", "boom")
    assert triggered == []


async def test_works_across_processes_without_memory():
    # 一次性任務：每次都是新的 AlertManager，計數完全來自 crawler_logs
    for statuses, expected in [(["failed"], []), (["failed", "failed"], [("x", 2)])]:
        manager, triggered = make(2, statuses)
        await manager.record_failure("x", "boom")
        assert triggered == expected


async def test_load_failure_does_not_raise():
    async def broken(_name, _limit):
        raise RuntimeError("db down")
    manager = AlertManager(threshold=1, load_recent_statuses=broken)
    await manager.record_failure("x", "boom")  # 告警檢查失敗不能讓爬蟲任務再多一個例外


def test_send_email_skipped_without_alert_email(monkeypatch):
    manager = AlertManager()
    monkeypatch.setattr("monitor.alert.settings.alert_email", None)
    called = []
    monkeypatch.setattr("smtplib.SMTP", lambda *a, **kw: called.append(True))

    manager._send_email("subject", "body")
    assert called == []


def test_send_slack_skipped_without_webhook(monkeypatch):
    manager = AlertManager()
    monkeypatch.setattr("monitor.alert.settings.slack_webhook_url", None)
    called = []
    monkeypatch.setattr("httpx.post", lambda *a, **kw: called.append(True))

    manager._send_slack("subject", "body")
    assert called == []


def test_send_slack_posts_to_webhook(monkeypatch):
    manager = AlertManager()
    monkeypatch.setattr("monitor.alert.settings.slack_webhook_url", "https://hooks.example.com/x")
    calls = []
    monkeypatch.setattr("httpx.post", lambda url, json, timeout: calls.append((url, json)))

    manager._send_slack("subject", "body")
    assert calls[0][0] == "https://hooks.example.com/x"
    assert "subject" in calls[0][1]["text"]
