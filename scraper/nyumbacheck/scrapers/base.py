"""Base scraper interface all platform scrapers must implement."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import AsyncIterator


@dataclass
class ScrapedListing:
    """Raw listing data as extracted from a platform page."""

    platform_slug: str
    platform_listing_id: str
    url: str
    title: str | None = None
    listing_type: str = "rent"  # "rent" | "sale"

    # Pricing
    price_ksh: float | None = None
    currency: str = "KES"

    # Property
    bedrooms: int | None = None
    bathrooms: int | None = None
    sqft: float | None = None
    property_type: str | None = None  # apartment, house, studio, land, commercial

    # Location
    raw_address: str | None = None
    neighbourhood: str | None = None
    latitude: float | None = None
    longitude: float | None = None

    # Agent
    agent_name: str | None = None
    agent_phone: str | None = None

    # Images
    image_urls: list[str] = field(default_factory=list)

    # Platform metadata
    listed_at: str | None = None  # ISO date string
    days_on_market: int | None = None
    raw_data: dict = field(default_factory=dict)


class BaseScraper(ABC):
    """
    Abstract base class for all platform scrapers.

    Each scraper must implement:
    - scrape_listing_urls: yield all listing URLs from the platform
    - scrape_listing: parse a single listing page into a ScrapedListing
    """

    platform_slug: str = ""
    base_url: str = ""

    @abstractmethod
    async def scrape_listing_urls(self) -> AsyncIterator[str]:
        """Yield all listing URLs to be scraped."""
        ...

    @abstractmethod
    async def scrape_listing(self, url: str) -> ScrapedListing | None:
        """Parse a single listing URL and return structured data."""
        ...

    async def run(self) -> AsyncIterator[ScrapedListing]:
        """Full scrape run: iterate over listing URLs and parse each one."""
        async for url in self.scrape_listing_urls():
            try:
                listing = await self.scrape_listing(url)
                if listing is not None:
                    yield listing
            except Exception as exc:
                from nyumbacheck.utils.logger import get_logger
                log = get_logger(__name__)
                log.warning("scraper.listing_failed", url=url, error=str(exc))
                continue
