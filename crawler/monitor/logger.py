import sys

from loguru import logger


def setup_logger(log_level: str = "INFO") -> None:
    logger.remove()

    logger.add(
        sys.stdout,
        level=log_level,
        colorize=True,
        format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>",
    )

    logger.add(
        "logs/crawler.log",
        level=log_level,
        rotation="00:00",
        retention="30 days",
        encoding="utf-8",
        format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {name}:{function}:{line} - {message}",
    )

    logger.add(
        "logs/crawler_error.log",
        level="ERROR",
        rotation="00:00",
        retention="90 days",
        encoding="utf-8",
        format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {name}:{function}:{line} - {message}",
    )
