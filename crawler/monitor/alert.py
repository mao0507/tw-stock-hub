import smtplib
from collections.abc import Awaitable, Callable
from email.message import EmailMessage

import httpx
from loguru import logger
from sqlalchemy import text

from config import settings
from db.connection import get_session


StatusLoader = Callable[[str, int], Awaitable[list[str]]]


def consecutive_failures(recent_statuses: list[str]) -> int:
    """最近幾次執行結果（新到舊）中，開頭連續失敗的次數。"""
    count = 0
    for status in recent_statuses:
        if status != "failed":
            break
        count += 1
    return count


async def _load_recent_statuses(crawler_name: str, limit: int) -> list[str]:
    async with get_session() as session:
        rows = await session.execute(
            text("""
                SELECT status FROM crawler_logs
                WHERE crawler_name = :name
                ORDER BY run_at DESC, id DESC
                LIMIT :limit
            """),
            {"name": crawler_name, "limit": limit},
        )
        return [str(r[0]) for r in rows]


class AlertManager:
    """連續失敗告警。計數來自 crawler_logs（一次性任務沒有常駐記憶體可存計數）。

    剛好達到門檻時告警一次；之後同一段連續失敗不再重複告警，成功一次即重新計數。
    """

    def __init__(self, threshold: int = 3, load_recent_statuses: StatusLoader = _load_recent_statuses) -> None:
        self._threshold = threshold
        self._load = load_recent_statuses

    async def record_failure(self, crawler_name: str, error: str) -> None:
        """在本次失敗寫入 crawler_logs 之後呼叫。"""
        try:
            # 多取一筆才能分辨「剛好達門檻」與「早已超過門檻」
            statuses = await self._load(crawler_name, self._threshold + 1)
        except Exception as e:
            logger.error(f"[Alert] 讀取 {crawler_name} 執行紀錄失敗，略過告警檢查: {e}")
            return
        count = consecutive_failures(statuses)
        logger.warning(f"[Alert] {crawler_name} fail count={count}/{self._threshold}")
        if count == self._threshold:
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


alert_manager = AlertManager(threshold=settings.alert_fail_threshold)
