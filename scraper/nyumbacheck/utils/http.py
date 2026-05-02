"""Rate-limited async HTTP client with retry logic."""

import asyncio
import time
from collections import defaultdict
from typing import Any

import httpx
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)

from nyumbacheck.utils.config import settings
from nyumbacheck.utils.logger import get_logger

log = get_logger(__name__)


class RateLimiter:
    """Token bucket rate limiter per domain."""

    def __init__(self, rps: float = 0.5):
        self.rps = rps
        self.min_interval = 1.0 / rps
        self._last_call: dict[str, float] = defaultdict(float)
        self._locks: dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)

    async def acquire(self, domain: str) -> None:
        async with self._locks[domain]:
            elapsed = time.monotonic() - self._last_call[domain]
            if elapsed < self.min_interval:
                await asyncio.sleep(self.min_interval - elapsed)
            self._last_call[domain] = time.monotonic()


_rate_limiter = RateLimiter(rps=settings.scraper_rate_limit_rps)


def _get_domain(url: str) -> str:
    from urllib.parse import urlparse
    return urlparse(url).netloc


class ScraperClient:
    """Async HTTP client with rate limiting, retries, and proxy support."""

    def __init__(self):
        proxies = {"all://": settings.scraper_proxy_url} if settings.scraper_proxy_url else None
        self._client = httpx.AsyncClient(
            headers={
                "User-Agent": settings.scraper_user_agent,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
                "Accept-Encoding": "gzip, deflate, br",
                "Connection": "keep-alive",
            },
            timeout=settings.scraper_request_timeout,
            follow_redirects=True,
            proxies=proxies,
        )

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self._client.aclose()

    @retry(
        stop=stop_after_attempt(settings.scraper_max_retries),
        wait=wait_exponential(multiplier=2, min=2, max=30),
        retry=retry_if_exception_type((httpx.HTTPError, httpx.TimeoutException)),
        reraise=True,
    )
    async def get(self, url: str, **kwargs: Any) -> httpx.Response:
        domain = _get_domain(url)
        await _rate_limiter.acquire(domain)
        log.debug("http.get", url=url, domain=domain)
        response = await self._client.get(url, **kwargs)
        response.raise_for_status()
        return response
