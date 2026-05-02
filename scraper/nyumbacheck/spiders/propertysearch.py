"""
PropertySearch.co.ke spider — Scrapy spider for Nairobi property listings.
Scrapes listing pages with full deduplication and normalisation pipeline.
"""
from __future__ import annotations

import re
from typing import Any, Generator
from urllib.parse import urljoin

import scrapy
from scrapy.http import Response

from ..items import ListingItem
from ..utils.normalise import normalise_price, normalise_phone, canonical_neighbourhood


PLATFORM_SLUG = "propertysearch"
BASE_URL = "https://www.propertysearch.co.ke"


class PropertySearchSpider(scrapy.Spider):
    name = "propertysearch"
    allowed_domains = ["propertysearch.co.ke"]

    # Rotate between rent and sale listing types
    start_urls = [
        "https://www.propertysearch.co.ke/listings/rent/nairobi/",
        "https://www.propertysearch.co.ke/listings/sale/nairobi/",
    ]

    custom_settings = {
        "DOWNLOAD_DELAY": 2.0,
        "RANDOMIZE_DOWNLOAD_DELAY": True,
        "CONCURRENT_REQUESTS_PER_DOMAIN": 2,
        "ROBOTSTXT_OBEY": True,
        "USER_AGENT": (
            "Mozilla/5.0 (compatible; NyumbaCheckBot/1.0; "
            "+https://nyumbacheck.co.ke/bot)"
        ),
        "DEFAULT_REQUEST_HEADERS": {
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-KE,en;q=0.9",
        },
    }

    def parse(self, response: Response) -> Generator:
        """Parse a listing index page and follow pagination + detail links."""
        listing_type = "rent" if "/rent/" in response.url else "sale"

        for card in response.css(".property-listing, .listing-item, article.property"):
            link = card.css("a[href*='/listing/'], a[href*='/property/']::attr(href)").get()
            if link:
                yield response.follow(
                    link,
                    callback=self.parse_listing,
                    cb_kwargs={"listing_type": listing_type},
                )

        # Pagination
        next_page = response.css(
            "a[rel='next']::attr(href), .pagination .next::attr(href), "
            "a:contains('Next')::attr(href)"
        ).get()
        if next_page:
            yield response.follow(next_page, callback=self.parse)

    def parse_listing(self, response: Response, listing_type: str = "rent") -> Generator:
        """Extract a full listing detail page."""
        item = ListingItem()

        item["platform"] = PLATFORM_SLUG
        item["url"] = response.url
        item["listing_type"] = listing_type

        # Title
        item["title"] = (
            response.css("h1.property-title::text, h1.listing-title::text, h1::text")
            .get("").strip() or None
        )

        # Price
        raw_price = (
            response.css(
                ".price::text, .property-price::text, span[class*='price']::text"
            ).get("").strip()
        )
        item["price_ksh"] = normalise_price(raw_price)

        # Bedrooms / bathrooms / sqft
        specs_text = " ".join(
            response.css(".specs *, .property-specs *, .features li::text").getall()
        )
        item["bedrooms"] = _extract_int(specs_text, r"(\d+)\s*(?:bed(?:room)?s?|BR)")
        item["bathrooms"] = _extract_int(specs_text, r"(\d+)\s*(?:bath(?:room)?s?|BA)")
        item["sqft"] = _extract_float(specs_text, r"([\d,]+)\s*(?:sq\.?\s*ft|sqft|m²)")

        # Address / neighbourhood
        raw_address = (
            response.css(
                ".address::text, .property-location::text, "
                ".location::text, [itemprop='address']::text"
            ).get("").strip()
        )
        item["raw_address"] = raw_address or None
        item["neighbourhood"] = canonical_neighbourhood(raw_address)

        # Agent phone
        raw_phone = (
            response.css(
                "a[href^='tel:']::attr(href), .agent-phone::text, "
                ".contact-phone::text"
            ).get("").replace("tel:", "").strip()
        )
        item["agent_phone"] = normalise_phone(raw_phone) if raw_phone else None

        # Agent name
        item["agent_name"] = (
            response.css(
                ".agent-name::text, .listing-agent::text, .agent h2::text"
            ).get(None) or None
        )

        # Images
        item["image_urls"] = response.css(
            ".property-images img::attr(src), "
            ".gallery img::attr(src), "
            ".slider img::attr(data-src), "
            ".slider img::attr(src)"
        ).getall()

        # External listing ID from URL slug
        slug_match = re.search(r"/(?:listing|property)/([^/]+)/?$", response.url)
        item["external_id"] = slug_match.group(1) if slug_match else None

        item["description"] = (
            " ".join(
                response.css(
                    ".description::text, .property-description::text, "
                    "article p::text"
                ).getall()
            ).strip() or None
        )

        yield item


# ── Helpers ───────────────────────────────────────────────────────────────────

def _extract_int(text: str, pattern: str) -> int | None:
    m = re.search(pattern, text, re.IGNORECASE)
    return int(m.group(1)) if m else None


def _extract_float(text: str, pattern: str) -> float | None:
    m = re.search(pattern, text, re.IGNORECASE)
    if not m:
        return None
    try:
        return float(m.group(1).replace(",", ""))
    except ValueError:
        return None
