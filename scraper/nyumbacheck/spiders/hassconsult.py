"""
HassConsult spider — premium residential listings from hassconsult.co.ke.
HassConsult is Kenya's leading property research firm and estate agency.
"""
from __future__ import annotations

import re
from typing import Generator

import scrapy
from scrapy.http import Response

from ..items import ListingItem
from ..utils.normalise import normalise_price, normalise_phone, canonical_neighbourhood


PLATFORM_SLUG = "hassconsult"
BASE_URL = "https://www.hassconsult.co.ke"


class HassConsultSpider(scrapy.Spider):
    name = "hassconsult"
    allowed_domains = ["hassconsult.co.ke"]

    start_urls = [
        "https://www.hassconsult.co.ke/residential-for-rent/nairobi",
        "https://www.hassconsult.co.ke/residential-for-sale/nairobi",
    ]

    custom_settings = {
        "DOWNLOAD_DELAY": 2.5,
        "RANDOMIZE_DOWNLOAD_DELAY": True,
        "CONCURRENT_REQUESTS_PER_DOMAIN": 1,
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
        listing_type = "rent" if "for-rent" in response.url else "sale"

        # HassConsult listing cards
        cards = response.css(
            ".property-item, .listing-card, .property-box, article.property"
        )
        for card in cards:
            link = card.css("a::attr(href)").get()
            if link:
                yield response.follow(
                    link,
                    callback=self.parse_listing,
                    cb_kwargs={"listing_type": listing_type},
                )

        # Pagination — HassConsult uses "?page=N" style
        next_page = response.css(
            "a[rel='next']::attr(href), .pagination li.active + li a::attr(href)"
        ).get()
        if next_page:
            yield response.follow(next_page, callback=self.parse)

    def parse_listing(self, response: Response, listing_type: str = "rent") -> Generator:
        item = ListingItem()

        item["platform"] = PLATFORM_SLUG
        item["url"] = response.url
        item["listing_type"] = listing_type

        # Title
        item["title"] = (
            response.css(
                "h1.property-title::text, h1.entry-title::text, "
                ".listing-detail-title::text, h1::text"
            ).get("").strip() or None
        )

        # Price  (HassConsult shows "KES 250,000/month" or "KES 45,000,000")
        raw_price = (
            response.css(
                ".price::text, .property-price::text, "
                ".listing-price::text, span[class*='price']::text"
            ).get("").strip()
        )
        item["price_ksh"] = normalise_price(raw_price)

        # Specs
        specs = " ".join(response.css(".property-meta *, .property-specs *::text").getall())
        item["bedrooms"] = _extract_int(specs, r"(\d+)\s*(?:bed(?:room)?s?|BR)")
        item["bathrooms"] = _extract_int(specs, r"(\d+)\s*(?:bath(?:room)?s?|BA)")
        item["sqft"] = _extract_float(specs, r"([\d,]+)\s*(?:sq\.?\s*ft|sqft|m²|sqm)")

        # Address
        raw_address = (
            response.css(
                ".property-address::text, .location-info::text, "
                ".address::text, [itemprop='address']::text"
            ).get("").strip()
        )
        item["raw_address"] = raw_address or None
        item["neighbourhood"] = canonical_neighbourhood(raw_address)

        # Agent
        raw_phone = (
            response.css("a[href^='tel:']::attr(href), .agent-contact::text").get("").replace("tel:", "").strip()
        )
        item["agent_phone"] = normalise_phone(raw_phone) if raw_phone else None
        item["agent_name"] = (
            response.css(".agent-name::text, .broker-name::text").get(None) or None
        )

        # Images
        item["image_urls"] = (
            response.css(
                ".property-gallery img::attr(src), "
                ".gallery-image::attr(src), "
                ".flexslider img::attr(src), "
                ".property-images img::attr(data-src), "
                ".property-images img::attr(src)"
            ).getall()
        )

        # External ID from URL
        slug_match = re.search(r"/([^/?#]+)/?(?:\?|#|$)", response.url)
        item["external_id"] = slug_match.group(1) if slug_match else None

        item["description"] = (
            " ".join(
                response.css(".property-description::text, .entry-content p::text").getall()
            ).strip() or None
        )

        yield item


# ── Helpers ────────────────────────────────────────────────────────────────────

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
