import re
from datetime import date
from decimal import Decimal, InvalidOperation


class DataCleaner:
    @staticmethod
    def remove_commas(value: str) -> str:
        if not isinstance(value, str):
            return str(value)
        return value.replace(",", "")

    @staticmethod
    def parse_numeric(value: str | None) -> Decimal | None:
        if value is None:
            return None
        cleaned = DataCleaner.remove_commas(str(value).strip())
        if cleaned in ("--", "-", "X", "", "N/A", "―"):
            return None
        try:
            return Decimal(cleaned)
        except InvalidOperation:
            return None

    @staticmethod
    def parse_change(value: str | None) -> Decimal | None:
        if value is None:
            return None
        cleaned = DataCleaner.remove_commas(str(value).strip())
        if cleaned in ("--", "-", "X", "", "0"):
            return Decimal("0")
        cleaned = cleaned.lstrip("+")
        try:
            return Decimal(cleaned)
        except InvalidOperation:
            return None

    @staticmethod
    def parse_tw_date(value: str) -> date | None:
        if not value:
            return None
        value = str(value).strip()

        m = re.match(r"^(\d{2,3})[/\-.](\d{1,2})[/\-.](\d{1,2})$", value)
        if m:
            year = int(m.group(1)) + 1911
            month = int(m.group(2))
            day = int(m.group(3))
            try:
                return date(year, month, day)
            except ValueError:
                return None

        m = re.match(r"^(\d{3})(\d{2})(\d{2})$", value)
        if m:
            year = int(m.group(1)) + 1911
            month = int(m.group(2))
            day = int(m.group(3))
            try:
                return date(year, month, day)
            except ValueError:
                return None

        return None

    @staticmethod
    def parse_ad_date(value: str) -> date | None:
        if not value:
            return None
        value = str(value).strip()

        m = re.match(r"^(\d{4})(\d{2})(\d{2})$", value)
        if m:
            try:
                return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
            except ValueError:
                return None

        m = re.match(r"^(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})$", value)
        if m:
            try:
                return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
            except ValueError:
                return None

        return None

    @staticmethod
    def normalize_stock_id(value: str) -> str:
        return str(value).strip()

    @staticmethod
    def parse_volume_in_thousand(value: str | None) -> int | None:
        n = DataCleaner.parse_numeric(value)
        if n is None:
            return None
        return int(n * 1000)
