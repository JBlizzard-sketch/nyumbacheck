"""
BuyRentKenya scraper.

Scrapes listing index pages + individual listing pages with respectful
rate limiting. Uses CSS selectors against the HTML structure as of Jan 2025.
Update selectors here when the site structure changes.
"""

import re
from typing import AsyncIterator
from urllib.parse import urljoin, urlparse, parse_qs, urlencode, urlunparse

from bs4 import BeautifulSoup

from nyumbacheck.scrapers.base import BaseScraper, ScrapedListing
from nyumbacheck.utils.http import ScraperClient
from nyumbacheck.utils.logger import get_logger

log = get_logger(__name__)

BASE_URL = "https://www.buyrentkenya.com"
LISTING_TYPES = [
    ("rent", "/listings/houses-apartments-for-rent-in-nairobi"),
    ("sale", "/listings/houses-for-sale-in-nairobi"),
]
MAX_PAGES = 100  # safety cap; adjust if the site has more


class BuyRentKenyaScraper(BaseScraper):
    platform_slug = "buyrentkenya"
    base_url = BASE_URL

    async def scrape_listing_urls(self) -> AsyncIterator[str]:
        async with ScraperClient() as client:
            for listing_type, path in LISTING_TYPES:
                page = 1
                while page <= MAX_PAGES:
                    url = self._build_page_url(path, page)
                    log.info("brk.scraping_index", url=url, page=page, listing_type=listing_type)
                    try:
                        resp = await client.get(url)
                        soup = BeautifulSoup(resp.text, "lxml")
                        urls = self._extract_listing_urls(soup)
                        if not urls:
                            log.info("brk.no_more_listings", page=page)
                            break
                        for listing_url in urls:
                            yield listing_url
                        page += 1
                    except Exception as exc:
                        log.error("brk.index_page_failed", url=url, error=str(exc))
                        break

    async def scrape_listing(self, url: str) -> ScrapedListing | None:
        async with ScraperClient() as client:
            try:
                resp = await client.get(url)
                soup = BeautifulSoup(resp.text, "lxml")
                return self._parse_listing(url, soup)
            except Exception as exc:
                log.warning("brk.listing_failed", url=url, error=str(exc))
                return None

    def _build_page_url(self, path: str, page: int) -> str:
        base = urljoin(BASE_URL, path)
        if page == 1:
            return base
        parsed = urlparse(base)
        params = parse_qs(parsed.query)
        params["page"] = [str(page)]
        new_query = urlencode(params, doseq=True)
        return urlunparse(parsed._replace(query=new_query))

    def _extract_listing_urls(self, soup: BeautifulSoup) -> list[str]:
        urls = []
        # BuyRentKenya uses listing cards with anchors
        for a_tag in soup.select("a[data-testid='listing-card-link'], a.listing-card__link, div.listings-container a[href*='/listings/']"):
            href = a_tag.get("href", "")
            if href and "/listings/" in href and href not in urls:
                full_url = urljoin(BASE_URL, href)
                urls.append(full_url)
        return urls

    def _parse_listing(self, url: str, soup: BeautifulSoup) -> ScrapedListing | None:
        platform_listing_id = self._extract_listing_id(url)
        if not platform_listing_id:
            return None

        listing_type = "sale" if "/for-sale" in url else "rent"

        title = self._text(soup, "h1[data-testid='listing-title'], h1.listing-title, h1")
        price_ksh = self._extract_price(soup)
        bedrooms = self._extract_int(soup, "[data-testid='bedrooms'], .bedrooms-count")
        bathrooms = self._extract_int(soup, "[data-testid='bathrooms'], .bathrooms-count")
        sqft = self._extract_sqft(soup)
        property_type = self._text(soup, "[data-testid='property-type'], .property-type")
        raw_address = self._text(soup, "[data-testid='listing-address'], .listing-location, address")
        neighbourhood = self._extract_neighbourhood(raw_address or "")
        agent_name = self._text(soup, "[data-testid='agent-name'], .agent-name, .agent__name")
        agent_phone = self._extract_phone(soup)
        image_urls = self._extract_images(soup)
        days_on_market = self._extract_days_on_market(soup)

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
            property_type=property_type,
            raw_address=raw_address,
            neighbourhood=neighbourhood,
            agent_name=agent_name,
            agent_phone=agent_phone,
            image_urls=image_urls,
            days_on_market=days_on_market,
            raw_data={"url": url, "source": "buyrentkenya"},
        )

    def _extract_listing_id(self, url: str) -> str | None:
        match = re.search(r"[-/](\d{5,})(?:[/?]|$)", url)
        return match.group(1) if match else urlparse(url).path.rstrip("/").split("/")[-1]

    def _text(self, soup: BeautifulSoup, selector: str) -> str | None:
        for sel in selector.split(", "):
            el = soup.select_one(sel.strip())
            if el:
                return el.get_text(strip=True) or None
        return None

    def _extract_price(self, soup: BeautifulSoup) -> float | None:
        price_el = soup.select_one(
            "[data-testid='listing-price'], .listing-price, .price__amount, span.price"
        )
        if not price_el:
            return None
        raw = price_el.get_text(strip=True)
        digits = re.sub(r"[^\d.]", "", raw)
        try:
            return float(digits)
        except ValueError:
            return None

    def _extract_int(self, soup: BeautifulSoup, selector: str) -> int | None:
        el = soup.select_one(selector)
        if not el:
            return None
        raw = re.sub(r"[^\d]", "", el.get_text(strip=True))
        try:
            return int(raw)
        except ValueError:
            return None

    def _extract_sqft(self, soup: BeautifulSoup) -> float | None:
        for el in soup.select("[data-testid='size'], .size, .floor-area"):
            raw = el.get_text(strip=True)
            match = re.search(r"([\d,]+(?:\.\d+)?)\s*(?:sq\.?\s*ft|sqft|m²|sqm)", raw, re.IGNORECASE)
            if match:
                val = float(match.group(1).replace(",", ""))
                # Convert sqm to sqft if needed
                if "m²" in raw or "sqm" in raw.lower():
                    val *= 10.764
                return val
        return None

    def _extract_neighbourhood(self, address: str) -> str | None:
        from nyumbacheck.pipeline.address.normaliser import extract_neighbourhood
        return extract_neighbourhood(address)

    def _extract_phone(self, soup: BeautifulSoup) -> str | None:
        for el in soup.select("[data-testid='agent-phone'], .agent-phone, a[href^='tel:']"):
            raw = el.get("href", "") or el.get_text(strip=True)
            raw = re.sub(r"tel:", "", raw).strip()
            if raw:
                return raw
        return None

    def _extract_images(self, soup: BeautifulSoup) -> list[str]:
        urls = []
        for img in soup.select("img[data-testid='listing-image'], div.gallery img, .listing-photos img"):
            src = img.get("data-src") or img.get("src") or ""
            if src and src.startswith("http") and src not in urls:
                urls.append(src)
        return urls[:20]  # cap at 20 images

    def _extract_days_on_market(self, soup: BeautifulSoup) -> int | None:
        for el in soup.select("[data-testid='days-on-market'], .days-on-market, .listing-age"):
            raw = el.get_text(strip=True)
            match = re.search(r"(\d+)\s*day", raw, re.IGNORECASE)
            if match:
                return int(match.group(1))
        return None
