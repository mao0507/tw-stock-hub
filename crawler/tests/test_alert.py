from monitor.alert import AlertManager


def test_record_success_resets_count():
    manager = AlertManager(threshold=3)
    manager.record_failure("twse_daily", "boom")
    manager.record_success("twse_daily")
    assert manager._fail_counts["twse_daily"] == 0


def test_record_failure_triggers_alert_at_threshold(monkeypatch):
    manager = AlertManager(threshold=2)
    triggered = []
    monkeypatch.setattr(manager, "_trigger_alert", lambda name, error, count: triggered.append((name, count)))

    manager.record_failure("twse_daily", "boom")
    assert triggered == []

    manager.record_failure("twse_daily", "boom again")
    assert triggered == [("twse_daily", 2)]


def test_record_failure_only_alerts_once_per_incident(monkeypatch):
    manager = AlertManager(threshold=1)
    triggered = []
    monkeypatch.setattr(manager, "_trigger_alert", lambda name, error, count: triggered.append(count))

    manager.record_failure("twse_daily", "boom")
    manager.record_failure("twse_daily", "boom")
    assert triggered == [1]


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
