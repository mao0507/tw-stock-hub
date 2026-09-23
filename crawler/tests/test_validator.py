from datetime import date, timedelta
from decimal import Decimal

from pipeline.validator import DataValidator


def test_validate_quote_valid():
    data = {"high": 12, "low": 9, "open": 10, "close": 11, "volume": 100}
    assert DataValidator.validate_quote(data) is True


def test_validate_quote_high_less_than_low():
    data = {"high": 8, "low": 9, "open": 10, "close": 11, "volume": 100}
    assert DataValidator.validate_quote(data) is False


def test_validate_quote_high_less_than_open_or_close():
    data = {"high": 10, "low": 9, "open": 12, "close": 11, "volume": 100}
    assert DataValidator.validate_quote(data) is False


def test_validate_quote_low_greater_than_open_or_close():
    data = {"high": 12, "low": 11, "open": 9, "close": 10, "volume": 100}
    assert DataValidator.validate_quote(data) is False


def test_validate_quote_zero_volume():
    data = {"high": 12, "low": 9, "open": 10, "close": 11, "volume": 0}
    assert DataValidator.validate_quote(data) is False


def test_validate_quote_bad_input_returns_false():
    assert DataValidator.validate_quote({"high": "n/a"}) is False


def test_validate_institutional_consistent():
    data = {
        "foreign_buy": 1000, "foreign_sell": 400, "foreign_net": 600,
        "trust_buy": 100, "trust_sell": 50, "trust_net": 50,
        "dealer_buy": 10, "dealer_sell": 5, "dealer_net": 5,
    }
    assert DataValidator.validate_institutional(data) is True


def test_validate_institutional_mismatch_still_returns_true_but_logs():
    data = {
        "foreign_buy": 1000, "foreign_sell": 400, "foreign_net": 0,
        "trust_buy": 0, "trust_sell": 0, "trust_net": 0,
        "dealer_buy": 0, "dealer_sell": 0, "dealer_net": 0,
    }
    assert DataValidator.validate_institutional(data) is True


def test_validate_date_not_future_with_past_date():
    assert DataValidator.validate_date_not_future(date.today() - timedelta(days=1)) is True


def test_validate_date_not_future_with_future_date():
    assert DataValidator.validate_date_not_future(date.today() + timedelta(days=1)) is False


def test_validate_date_not_future_with_non_date():
    assert DataValidator.validate_date_not_future("2024-01-01") is False


def test_validate_price_positive():
    assert DataValidator.validate_price_positive(Decimal("10")) is True
    assert DataValidator.validate_price_positive(Decimal("0")) is False
    assert DataValidator.validate_price_positive(None) is False
