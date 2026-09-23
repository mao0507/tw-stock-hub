from datetime import date
from decimal import Decimal

import pytest

from pipeline.cleaner import DataCleaner


@pytest.mark.parametrize(
    "value,expected",
    [
        ("1,234", "1234"),
        ("1234", "1234"),
        (None, "None"),
    ],
)
def test_remove_commas(value, expected):
    assert DataCleaner.remove_commas(value) == expected


@pytest.mark.parametrize(
    "value,expected",
    [
        ("1,234.5", Decimal("1234.5")),
        ("--", None),
        ("-", None),
        ("X", None),
        ("", None),
        ("N/A", None),
        (None, None),
        ("not-a-number", None),
    ],
)
def test_parse_numeric(value, expected):
    assert DataCleaner.parse_numeric(value) == expected


@pytest.mark.parametrize(
    "value,expected",
    [
        ("+1,234", Decimal("1234")),
        ("-56", Decimal("-56")),
        ("--", Decimal("0")),
        ("0", Decimal("0")),
        (None, None),
    ],
)
def test_parse_change(value, expected):
    assert DataCleaner.parse_change(value) == expected


@pytest.mark.parametrize(
    "value,expected",
    [
        ("113/01/15", date(2024, 1, 15)),
        ("113-01-15", date(2024, 1, 15)),
        ("1130115", date(2024, 1, 15)),
        ("113/13/40", None),
        ("not-a-date", None),
        ("", None),
        (None, None),
    ],
)
def test_parse_tw_date(value, expected):
    assert DataCleaner.parse_tw_date(value) == expected


@pytest.mark.parametrize(
    "value,expected",
    [
        ("20240115", date(2024, 1, 15)),
        ("2024-01-15", date(2024, 1, 15)),
        ("2024/01/15", date(2024, 1, 15)),
        ("2024-13-40", None),
        ("bad", None),
        (None, None),
    ],
)
def test_parse_ad_date(value, expected):
    assert DataCleaner.parse_ad_date(value) == expected


def test_normalize_stock_id():
    assert DataCleaner.normalize_stock_id(" 2330 ") == "2330"


@pytest.mark.parametrize(
    "value,expected",
    [
        ("1,234", 1234000),
        ("--", None),
        (None, None),
    ],
)
def test_parse_volume_in_thousand(value, expected):
    assert DataCleaner.parse_volume_in_thousand(value) == expected
