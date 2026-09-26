"""券商分點進出爬蟲（TWSE BSR）。

資料來源：https://bsr.twse.com.tw/bshtm/bsMenu.aspx
特性：逐檔查詢、有圖形驗證碼、回傳 big5 CSV。因成本高，只追蹤 config 指定的少數熱門股。

流程：
  1. GET bsMenu.aspx → 取 __VIEWSTATE / __EVENTVALIDATION / 驗證碼圖片
  2. OCR 驗證碼（ddddocr）
  3. POST bsMenu.aspx（帶 viewstate + 股號 + 驗證碼）→ 取下載連結
  4. GET bsContent.aspx → big5 CSV → 解析分點

ponytail: 步驟 1~4 的 HTML/CSV 細節依 BSR 現況，需對線上實測校正；
解析邏輯（parse_bsr_csv）為純函式並有自我檢查。
"""

import asyncio
import csv
import io
import re

import httpx
from bs4 import BeautifulSoup
from loguru import logger
from sqlalchemy import text

from config import settings
from crawlers.base.base_crawler import BaseCrawler
from crawlers.base.http_client import BASE_HEADERS, USER_AGENTS
from db.connection import get_session
from pipeline.writer import DataWriter
from pipeline.notify import publisher

BSR_BASE = "https://bsr.twse.com.tw/bshtm"
MENU_URL = f"{BSR_BASE}/bsMenu.aspx"
CONTENT_URL = f"{BSR_BASE}/bsContent.aspx"


def _to_int(raw: str) -> int:
    """'1,234' / ' 12 ' / '' → int。無法解析回 0。"""
    cleaned = re.sub(r"[^\d-]", "", raw or "")
    if not cleaned or cleaned == "-":
        return 0
    try:
        return int(cleaned)
    except ValueError:
        return 0


def _to_price(raw: str) -> float:
    cleaned = re.sub(r"[^\d.]", "", raw or "")
    try:
        return round(float(cleaned), 2) if cleaned else 0.0
    except ValueError:
        return 0.0


def parse_bsr_rows(text: str) -> dict[tuple[str, float], dict[str, int]]:
    """解析 BSR CSV → 價位別明細 {(broker_name, price): {"buy", "sell"}}。

    每列含兩組分點紀錄（左、右），每組欄位：序號, 券商, 價格, 買進股數, 賣出股數。
    同一券商同一價位的買賣股數累加（左右組可能撞同價位）。
    """
    result: dict[tuple[str, float], dict[str, int]] = {}

    def add(name: str, price: float, buy: int, sell: int) -> None:
        name = name.strip()
        if not name or name in ("券商", "證券商"):
            return
        slot = result.setdefault((name, price), {"buy": 0, "sell": 0})
        slot["buy"] += buy
        slot["sell"] += sell

    def is_serial(s: str) -> bool:
        return s.isdigit()

    def is_broker(s: str) -> bool:
        return bool(s) and not re.fullmatch(r"[\d.,\s-]+", s)

    # 每列有 1~2 組分點紀錄，版面可能含空白分隔欄。
    # 以「序號(數字) + 券商(非純數字) + 價格 + 買 + 賣」樣式偵測每組，避免硬編 offset。
    for cols in csv.reader(io.StringIO(text)):
        cols = [c.strip() for c in cols]
        i = 0
        while i + 4 < len(cols):
            if is_serial(cols[i]) and is_broker(cols[i + 1]):
                add(cols[i + 1], _to_price(cols[i + 2]),
                    _to_int(cols[i + 3]), _to_int(cols[i + 4]))
                i += 5
            else:
                i += 1

    return result


def aggregate_by_broker(
    rows: dict[tuple[str, float], dict[str, int]],
) -> dict[str, dict[str, int]]:
    """價位別明細 → 各券商加總 {broker_name: {"buy", "sell"}}。"""
    agg: dict[str, dict[str, int]] = {}
    for (name, _price), v in rows.items():
        slot = agg.setdefault(name, {"buy": 0, "sell": 0})
        slot["buy"] += v["buy"]
        slot["sell"] += v["sell"]
    return agg


def decode_bsr_csv(raw: bytes) -> str:
    """BSR 目前回 UTF-8（含 BOM）；舊版為 big5。先試 UTF-8 再退回 big5。"""
    try:
        return raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        return raw.decode("big5", errors="ignore")


CAPTCHA_LEN = 5
_ocr = None


def normalize_captcha(raw: str) -> str | None:
    """BSR 驗證碼為 5 碼大寫英數；OCR 字形對但常給小寫 → 轉大寫。長度不符回 None（不送出，省請求）。"""
    code = re.sub(r"[^A-Za-z0-9]", "", raw or "").upper()
    return code if len(code) == CAPTCHA_LEN else None


def _solve_captcha(image_bytes: bytes) -> str | None:
    """OCR 驗證碼。需 ddddocr（onnxruntime）。缺套件時拋出明確錯誤。"""
    global _ocr
    if _ocr is None:
        try:
            import ddddocr  # type: ignore
        except ImportError as e:  # pragma: no cover - 環境相依
            raise RuntimeError(
                "BrokerCrawler 需要 ddddocr 解驗證碼，請確認已安裝（uv add ddddocr）"
            ) from e
        _ocr = ddddocr.DdddOcr(show_ad=False)
    return normalize_captcha(_ocr.classification(image_bytes))


class BrokerCrawler(BaseCrawler):
    crawler_name = "BrokerCrawler"
    referer_url = MENU_URL

    def __init__(self, stocks: list[str] | None = None) -> None:
        """stocks：指定股票（按需爬取）；未指定則用追蹤清單 BROKER_WATCH_STOCKS。"""
        super().__init__()
        self._stocks = stocks
        self._trade_date = None

    async def _prepare(self) -> list[str]:
        """BSR 只提供「最近交易日」且為上市股 → 交易日取最新行情日，清單只留上市。"""
        wanted = self._stocks or settings.broker_watch_list
        async with get_session() as session:
            self._trade_date = (await session.execute(text(
                "SELECT MAX(date) FROM daily_quotes WHERE date <= :d"), {"d": self.target_date})).scalar()
            r = await session.execute(text(
                "SELECT id FROM stocks WHERE id = ANY(:ids) AND market = 'TWSE' AND is_active"), {"ids": wanted})
            listed = {row[0] for row in r.fetchall()}
        skipped = [s for s in wanted if s not in listed]
        if skipped:
            logger.info(f"[{self.crawler_name}] 非上市或不存在（BSR 無資料），略過：{','.join(skipped)}")
        return [s for s in wanted if s in listed]

    async def crawl(self) -> int:
        stocks = await self._prepare()
        if not stocks or self._trade_date is None:
            logger.warning(f"[{self.crawler_name}] 無可爬股票或無行情日，跳過")
            return 0

        total = 0
        for stock_id in stocks:
            try:
                count = await self._crawl_one(stock_id)
                total += count
                logger.info(f"[{self.crawler_name}] {stock_id}: {count} 分點")
            except Exception as e:
                logger.warning(f"[{self.crawler_name}] {stock_id} 失敗: {e}")
            await self._random_delay()

        await publisher.publish_done(self.crawler_name, self._trade_date, total)
        return total

    async def _crawl_one(self, stock_id: str, max_captcha_retry: int = 5) -> int:
        headers = {**BASE_HEADERS, "User-Agent": USER_AGENTS[0]}
        # verify=False：BSR 憑證鏈不完整，httpx 預設驗證會失敗。
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(30.0), follow_redirects=True, headers=headers, verify=False
        ) as client:
            for attempt in range(max_captcha_retry):
                rows = await self._try_fetch(client, stock_id)
                if rows is not None:
                    return await self._write(stock_id, rows)
                logger.debug(f"[{self.crawler_name}] {stock_id} 驗證碼重試 {attempt + 1}")
                await asyncio.sleep(1)
        raise RuntimeError(f"{stock_id} 驗證碼連續失敗 {max_captcha_retry} 次")

    async def _try_fetch(
        self, client: httpx.AsyncClient, stock_id: str
    ) -> dict[tuple[str, float], dict[str, int]] | None:
        """單次嘗試（含一次驗證碼）。成功回價位別 dict，驗證碼錯誤回 None。"""
        menu = await client.get(MENU_URL)
        soup = BeautifulSoup(menu.text, "lxml")

        img = soup.find("img", src=re.compile("CaptchaImage"))
        if not img or not img.get("src"):
            raise RuntimeError("找不到驗證碼圖片")
        captcha_resp = await client.get(f"{BSR_BASE}/{img['src'].lstrip('./')}")
        code = _solve_captcha(captcha_resp.content)
        if code is None:
            return None

        # 所有隱藏欄位都要帶（少了 __VIEWSTATEENCRYPTED 等會被導到錯誤頁）
        form = {
            el["name"]: el.get("value", "")
            for el in soup.find_all("input")
            if el.get("name") and el.get("type") in ("hidden", "text")
        }
        form.update({
            "RadioButton_Normal": "RadioButton_Normal",
            "TextBox_Stkno": stock_id,
            "CaptchaControl1": code,
            "btnOK": "查詢",
        })
        post = await client.post(MENU_URL, data=form)
        post_soup = BeautifulSoup(post.text, "lxml")

        link = post_soup.find("a", href=re.compile("bsContent"))
        if not link or not link.get("href"):
            return None  # 驗證碼錯誤或查無資料 → 重試

        content = await client.get(f"{BSR_BASE}/{link['href'].lstrip('./')}")
        csv_text = decode_bsr_csv(content.content)
        rows = parse_bsr_rows(csv_text)
        return rows or None

    async def _write(
        self, stock_id: str, rows: dict[tuple[str, float], dict[str, int]]
    ) -> int:
        # 加總表：每券商一筆
        brokers = aggregate_by_broker(rows)
        agg_records = [
            {
                "date": self._trade_date,
                "stock_id": stock_id,
                "broker_name": name[:60],
                "buy": v["buy"],
                "sell": v["sell"],
                "net": v["buy"] - v["sell"],
            }
            for name, v in brokers.items()
        ]
        # 明細表：每券商每價位一筆
        detail_records = [
            {
                "date": self._trade_date,
                "stock_id": stock_id,
                "broker_name": name[:60],
                "price": price,
                "buy": v["buy"],
                "sell": v["sell"],
            }
            for (name, price), v in rows.items()
        ]
        count = await DataWriter.write_broker(agg_records)
        await DataWriter.write_broker_detail(detail_records)
        return count


def _selfcheck() -> None:
    # 版面 A：含空白分隔欄（11 欄）
    sample_a = "\n".join([
        "序號,券商,價格,買進股數,賣出股數,,序號,券商,價格,買進股數,賣出股數",
        "1,元大,100.5,\"10,000\",0,,1,凱基,100.5,0,\"5,000\"",
        "2,元大,101.0,\"2,000\",0,,2,富邦,101.0,0,\"3,000\"",
    ])
    rows_a = parse_bsr_rows(sample_a)
    assert rows_a[("元大", 100.5)] == {"buy": 10000, "sell": 0}, rows_a
    assert rows_a[("元大", 101.0)] == {"buy": 2000, "sell": 0}, rows_a
    a = aggregate_by_broker(rows_a)
    assert a["元大"] == {"buy": 12000, "sell": 0}, a
    assert a["凱基"] == {"buy": 0, "sell": 5000}, a
    assert a["富邦"] == {"buy": 0, "sell": 3000}, a

    # 版面 B：無分隔欄（10 欄）
    sample_b = "1,統一,50.0,\"1,000\",0,1,日盛,50.0,0,\"800\""
    b = aggregate_by_broker(parse_bsr_rows(sample_b))
    assert b["統一"] == {"buy": 1000, "sell": 0}, b
    assert b["日盛"] == {"buy": 0, "sell": 800}, b

    print("broker parse self-check ok")


if __name__ == "__main__":
    _selfcheck()
