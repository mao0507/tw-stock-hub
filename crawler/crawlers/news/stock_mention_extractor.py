import re
import time
from loguru import logger
from db.connection import get_session
from db.repository import get_all_stock_map


class StockMentionExtractor:
    CACHE_TTL = 86400
    STOCK_ID_PATTERN = re.compile(r"\b([0-9]{4,6})\b")

    def __init__(self) -> None:
        self._id_to_name: dict[str, str] = {}
        self._name_to_id: dict[str, str] = {}
        self._loaded_at: float = 0.0

    async def _ensure_loaded(self) -> None:
        now = time.monotonic()
        if now - self._loaded_at < self.CACHE_TTL and self._id_to_name:
            return

        async with get_session() as session:
            self._id_to_name = await get_all_stock_map(session)

        self._name_to_id = {}
        for stock_id, name in self._id_to_name.items():
            self._name_to_id[name] = stock_id
            short = self._shorten_name(name)
            if short and short != name:
                self._name_to_id[short] = stock_id

        self._loaded_at = now
        logger.debug(f"[StockMentionExtractor] Loaded {len(self._id_to_name)} stocks")

    def _shorten_name(self, name: str) -> str:
        suffixes = ["股份有限公司", "有限公司", "科技", "控股", "集團", "國際"]
        result = name
        for suffix in suffixes:
            result = result.replace(suffix, "")
        return result.strip()

    async def extract(self, text: str) -> list[str]:
        if not text:
            return []

        await self._ensure_loaded()
        found: set[str] = set()

        for match in self.STOCK_ID_PATTERN.finditer(text):
            code = match.group(1)
            if code in self._id_to_name:
                found.add(code)

        for keyword, stock_id in self._name_to_id.items():
            if len(keyword) >= 2 and keyword in text:
                found.add(stock_id)

        return list(found)

    async def force_refresh(self) -> None:
        self._loaded_at = 0.0
        await self._ensure_loaded()


extractor = StockMentionExtractor()
