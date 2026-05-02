"""
Scrapy Item definitions for NyumbaCheck.
All spiders yield ListingItem instances, which are then processed
by the normalisation and DB-write pipeline.
"""
from __future__ import annotations
import scrapy


class ListingItem(scrapy.Item):
    platform = scrapy.Field()
    url = scrapy.Field()
    external_id = scrapy.Field()
    listing_type = scrapy.Field()
    title = scrapy.Field()
    description = scrapy.Field()
    price_ksh = scrapy.Field()
    bedrooms = scrapy.Field()
    bathrooms = scrapy.Field()
    sqft = scrapy.Field()
    raw_address = scrapy.Field()
    neighbourhood = scrapy.Field()
    agent_name = scrapy.Field()
    agent_phone = scrapy.Field()
    image_urls = scrapy.Field()
