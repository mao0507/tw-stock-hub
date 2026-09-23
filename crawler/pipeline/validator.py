from decimal import Decimal
from loguru import logger


class DataValidator:
    @staticmethod
    def validate_quote(data: dict, stock_id: str = "") -> bool:
        prefix = f"[Quote {stock_id}]"
        try:
            high = Decimal(str(data.get("high", 0)))
            low = Decimal(str(data.get("low", 0)))
            open_ = Decimal(str(data.get("open", 0)))
            close = Decimal(str(data.get("close", 0)))
            volume = int(data.get("volume", 0))

            if high < low:
                logger.warning(f"{prefix} high({high}) < low({low})")
                return False
            if high < open_ or high < close:
                logger.warning(f"{prefix} high({high}) < open({open_}) or close({close})")
                return False
            if low > open_ or low > close:
                logger.warning(f"{prefix} low({low}) > open({open_}) or close({close})")
                return False
            if volume <= 0:
                logger.warning(f"{prefix} volume({volume}) <= 0")
                return False
            return True
        except Exception as e:
            logger.warning(f"{prefix} Validation error: {e}")
            return False

    @staticmethod
    def validate_institutional(data: dict, stock_id: str = "") -> bool:
        prefix = f"[Inst {stock_id}]"
        try:
            for prefix_key in ("foreign", "trust", "dealer"):
                buy = Decimal(str(data.get(f"{prefix_key}_buy", 0)))
                sell = Decimal(str(data.get(f"{prefix_key}_sell", 0)))
                net = Decimal(str(data.get(f"{prefix_key}_net", 0)))
                expected_net = buy - sell
                tolerance = Decimal("100")
                if abs(expected_net - net) > tolerance:
                    logger.warning(
                        f"{prefix} {prefix_key} net mismatch: "
                        f"buy({buy}) - sell({sell}) = {expected_net}, got {net}"
                    )
            return True
        except Exception as e:
            logger.warning(f"{prefix} Validation error: {e}")
            return True

    @staticmethod
    def validate_date_not_future(d: object) -> bool:
        from datetime import date as Date
        if not isinstance(d, Date):
            return False
        today = Date.today()
        if d > today:
            logger.warning(f"Date {d} is in the future (today: {today})")
            return False
        return True

    @staticmethod
    def validate_price_positive(price: Decimal | None, label: str = "") -> bool:
        if price is None or price <= 0:
            logger.warning(f"Invalid price {price} [{label}]")
            return False
        return True
