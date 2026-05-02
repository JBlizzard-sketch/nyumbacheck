"""
JumiaHouses Kenya scraper.

Scrapes house-africa.jumia.co.ke with rate limiting.
"""

import re
from typing import AsyncIterator
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

from nyumbacheck.scrapers.base import BaseScraper, ScrapedListing
from nyumbacheck.utils.http import ScraperClient
from nyumbacheck.utils.logger import get_logger

log = get_logger(__name__)

BASE_URL = "https://house.jumia.co.ke"
LISTING_PATHS = [
    ("rent", "/for-rent/nairobi/"),
    ("sale", "/for-sale/nairobi/"),
]
MAX_PAGES = 100


class JumiaHousesKeScraper(BaseScraper):
    platform_slug = "jumiahouseske"
    base_url = BASE_URL

    async def scrape_listing_urls(self) -> AsyncIterator[str]:
        async with ScraperClient() as client:
            for listing_type, path in LISTING_PATHS:
                page = 1
                while page <= MAX_PAGES:
                    url = f"{BASE_URL}{path}?page={page}"
                    log.info("jumia.scraping_index", url=url, page=page)
                    try:
                        resp = await client.get(url)
                        soup = BeautifulSoup(resp.text, "lxml")
                        urls = self._extract_listing_urls(soup)
                        if not urls:
                            break
                        for listing_url in urls:
                            yield listing_url
                        page += 1
                    except Exception as exc:
                        log.error("jumia.index_failed", url=url, error=str(exc))
                        break

    async def scrape_listing(self, url: str) -> ScrapedListing | None:
        async with ScraperClient() as client:
            try:
                resp = await client.get(url)
                soup = BeautifulSoup(resp.text, "lxml")
                return self._parse_listing(url, soup)
            except Exception as exc:
                log.warning("jumia.listing_failed", url=url, error=str(exc))
                return None

    def _extract_listing_urls(self, soup: BeautifulSoup) -> list[str]:
        urls = []
        for a_tag in soup.select("article.card a[href], div.property-card a[href]"):
            href = a_tag.get("href", "")
            if href and ("/for-rent/" in href or "/for-sale/" in href):
                full_url = urljoin(BASE_URL, href)
                if full_url not in urls:
                    urls.append(full_url)
        return urls

    def _parse_listing(self, url: str, soup: BeautifulSoup) -> ScrapedListing | None:
        platform_listing_id = urlparse(url).path.rstrip("/").split("/")[-1]
        listing_type = "sale" if "/for-sale/" in url else "rent"

        title_el = soup.select_one("h1.property-title, h1")
        title = title_el.get_text(strip=True) if title_el else None

        price_ksh = self._extract_price(soup)
        bedrooms = self._extract_stat(soup, "bed")
        bathrooms = self._extract_stat(soup, "bath")
        sqft = self._extract_sqft(soup)

        address_el = soup.select_one(".property-location, [itemprop='address'], .location")
        raw_address = address_el.get_text(strip=True) if address_el else None

        agent_el = soup.select_one(".agent-name, .seller-name")
        agent_name = agent_el.get_text(strip=True) if agent_el else None

        phone_el = soup.select_one("a[href^='tel:'], .phone-number")
        agent_phone = None
        if phone_el:
            agent_phone = (phone_el.get("href") or phone_el.get_text()).replace("tel:", "").strip()

        images = [
            img.get("data-src") or img.get("src")
            for img in soup.select(".gallery img, .property-gallery img")
            if (img.get("data-src") or img.get("src", "")).startswith("http")
        ][:20]

        from nyumbacheck.pipeline.address.normaliser import extract_neighbourhood
        neighbourhood = extract_neighbourhood(raw_address or "")

        return ScrapedListing(
            platform_slug=self.platform_slug,
            platform_listing_id=platform_listing_id,
            url=url,
            title=title,
            listing_type=listing_type,
            price_ksh=price_ksh,
            bedrooms=bedrooms,
            bathrooms=bathrooms,
            sqft=sqft,
            raw_address=raw_address,
            neighbourhood=neighbourhood,
            agent_name=agent_name,
            agent_phone=agent_phone,
            image_urls=images,
            raw_data={"url": url, "source": "jumiahouseske"},
        )

    def _extract_price(self, soup: BeautifulSoup) -> float | None:
        for sel in [".price", "span.price", ".property-price", "[itemprop='price']"]:
            el = soup.select_one(sel)
            if el:
                raw = el.get("content") or el.get_text(strip=True)
                digits = re.sub(r"[^\d.]", "", raw)
                try:
                    return float(digits)
                except ValueError:
                    continue
        return None

    def _extract_stat(self, soup: BeautifulSoup, keyword: str) -> int | None:
        for el in soup.select(f"[class*='{keyword}'], li"):
            text = el.get_text(strip=True).lower()
            if keyword in text:
                match = re.search(r"(\d+)", text)
                if match:
                    return int(match.group(1))
        return None

    def _extract_sqft(self, soup: BeautifulSoup) -> float | None:
        for el in soup.select(".size, .floor-area, [class*='area']"):
            text = el.get_text(strip=True)
            match = re.search(r"([\d,]+(?:\.\d+)?)\s*(?:sq\.?\s*ft|sqft|m²|sqm)", text, re.IGNORECASE)
            if match:
                val = float(match.group(1).replace(",", ""))
                if "m²" in text or "sqm" in text.lower():
                    val *= 10.764
                return val
        return None
