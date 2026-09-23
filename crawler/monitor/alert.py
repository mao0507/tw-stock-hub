import smtplib
from collections import defaultdict
from email.message import EmailMessage

import httpx
from loguru import logger

from config import settings


class AlertManager:
    def __init__(self, threshold: int = 3) -> None:
        self._fail_counts: dict[str, int] = defaultdict(int)
        self._alerted: set[str] = set()
        self._threshold = threshold

    def record_success(self, crawler_name: str) -> None:
        self._fail_counts[crawler_name] = 0
        self._alerted.discard(crawler_name)

    def record_failure(self, crawler_name: str, error: str) -> None:
        self._fail_counts[crawler_name] += 1
        count = self._fail_counts[crawler_name]
        logger.warning(f"[Alert] {crawler_name} fail count={count}/{self._threshold}")

        if count >= self._threshold and crawler_name not in self._alerted:
            self._alerted.add(crawler_name)
            self._trigger_alert(crawler_name, error, count)

    def _trigger_alert(self, crawler_name: str, error: str, count: int) -> None:
        subject = f"[台股爬蟲] {crawler_name} 連續失敗 {count} 次"
        body = f"爬蟲 {crawler_name} 已連續失敗 {count} 次。\n\n最後錯誤：{error}"

        self._send_email(subject, body)
        self._send_slack(subject, body)

    def _send_email(self, subject: str, body: str) -> None:
        alert_email = getattr(settings, "alert_email", None)
        if not alert_email:
            return
        try:
            msg = EmailMessage()
            msg["Subject"] = subject
            msg["From"] = "crawler@localhost"
            msg["To"] = alert_email
            msg.set_content(body)
            with smtplib.SMTP("localhost", 25, timeout=5) as smtp:
                smtp.send_message(msg)
            logger.info(f"[Alert] Email sent to {alert_email}")
        except Exception as e:
            logger.error(f"[Alert] Email failed: {e}")

    def _send_slack(self, subject: str, body: str) -> None:
        webhook_url = getattr(settings, "slack_webhook_url", None)
        if not webhook_url:
            return
        try:
            httpx.post(
                webhook_url,
                json={"text": f"*{subject}*\n{body}"},
                timeout=5,
            )
            logger.info("[Alert] Slack notification sent")
        except Exception as e:
            logger.error(f"[Alert] Slack failed: {e}")


alert_manager = AlertManager()
