import random
from typing import Any

import httpx

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
]

BASE_HEADERS = {
    "Accept": "application/json, text/html, */*",
    "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate",
    "Connection": "keep-alive",
}


class HttpClient:
    def __init__(
        self,
        timeout_connect: float = 10.0,
        timeout_read: float = 30.0,
        max_connections: int = 10,
    ) -> None:
        self._client: httpx.AsyncClient | None = None
        self._timeout = httpx.Timeout(
            connect=timeout_connect,
            read=timeout_read,
            write=10.0,
            pool=5.0,
        )
        self._limits = httpx.Limits(
            max_connections=max_connections,
            max_keepalive_connections=5,
        )

    async def __aenter__(self) -> "HttpClient":
        self._client = httpx.AsyncClient(
            timeout=self._timeout,
            limits=self._limits,
            http2=True,
            follow_redirects=True,
            headers={
                **BASE_HEADERS,
                "User-Agent": random.choice(USER_AGENTS),
            },
        )
        return self

    async def __aexit__(self, *_: Any) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None

    async def get(
        self,
        url: str,
        params: dict | None = None,
        headers: dict | None = None,
        referer: str | None = None,
    ) -> httpx.Response:
        if not self._client:
            raise RuntimeError("HttpClient not initialized. Use async with.")

        req_headers: dict = {}
        if referer:
            req_headers["Referer"] = referer
        if headers:
            req_headers.update(headers)

        response = await self._client.get(url, params=params, headers=req_headers or None)
        response.raise_for_status()
        return response

    async def post(
        self,
        url: str,
        data: dict | None = None,
        headers: dict | None = None,
        referer: str | None = None,
    ) -> httpx.Response:
        if not self._client:
            raise RuntimeError("HttpClient not initialized. Use async with.")

        req_headers: dict = {}
        if referer:
            req_headers["Referer"] = referer
        if headers:
            req_headers.update(headers)

        response = await self._client.post(url, data=data, headers=req_headers or None)
        response.raise_for_status()
        return response
