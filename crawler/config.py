from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    # 資料庫
    database_url: str = Field(..., env="DATABASE_URL")

    # 爬蟲設定
    retry_count: int = Field(3, env="RETRY_COUNT")
    retry_delay_seconds: int = Field(300, env="RETRY_DELAY")
    request_delay_min: float = Field(1.0, env="REQUEST_DELAY_MIN")
    request_delay_max: float = Field(3.0, env="REQUEST_DELAY_MAX")

    # 日誌
    log_level: str = Field("INFO", env="LOG_LEVEL")

    # 分點爬蟲：要追蹤的股票代號（逗號分隔）。BSR 逐檔查詢且有驗證碼，預設約 0050 成份股 + 部分中型權值股（~95 檔）。
    # 每檔約 4 次 HTTP + 1 次驗證碼 OCR + 1-3 秒隨機延遲，全序列無 concurrency，
    # 檔數增加約等比例拉長執行時間（50 檔約數分鐘，95 檔約需再視實際執行時間評估是否調高
    # scheduler/jobs.py 的 misfire_grace_time）。若要再擴大，建議先跑一次確認總時長再逐步增加，
    # 避免超過排程 misfire 容許時間或觸發 BSR 反爬蟲限制。
    broker_watch_stocks: str = Field(
        "2330,2317,2454,2308,2382,2412,2881,2882,2891,2886,"
        "2884,2885,2892,2890,1216,1303,1301,1326,2002,2207,"
        "2603,2609,2615,3008,3034,3037,3045,3711,2379,2357,"
        "2409,2474,3231,4938,2327,2345,2376,6505,5871,2880,"
        "2883,2887,1101,1102,2105,9910,2912,2801,2356,3661,"
        "2395,2408,2377,2301,2324,2352,2360,3017,3529,3533,"
        "3653,4904,5269,5347,6446,6488,6669,8046,9904,9914,"
        "9921,2618,2610,2637,1802,2049,2059,2707,3443,5876,"
        "5880,2812,2834,2845,1590,4919,6415,6605",
        env="BROKER_WATCH_STOCKS",
    )

    @property
    def broker_watch_list(self) -> list[str]:
        return [s.strip() for s in self.broker_watch_stocks.split(",") if s.strip()]

    # FinMind 歷史基本面 API token（可空，提高流量額度）
    finmind_token: str = Field("", env="FINMIND_TOKEN")

    # 告警
    alert_email: str | None = Field(None, env="ALERT_EMAIL")
    slack_webhook_url: str | None = Field(None, env="SLACK_WEBHOOK_URL")
    alert_fail_threshold: int = Field(3, env="ALERT_FAIL_THRESHOLD")

    model_config = {"env_file": ".env", "case_sensitive": False}


settings = Settings()
