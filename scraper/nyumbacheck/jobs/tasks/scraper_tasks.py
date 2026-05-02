"""Celery tasks for running platform scrapers."""

import asyncio
from nyumbacheck.jobs.celery_app import app
from nyumbacheck.utils.logger import get_logger

log = get_logger(__name__)

SCRAPER_REGISTRY = {
    "buyrentkenya": "nyumbacheck.scrapers.buyrentkenya.scraper.BuyRentKenyaScraper",
    "jumiahouseske": "nyumbacheck.scrapers.jumiahouseske.scraper.JumiaHousesKeScraper",
}


def _import_scraper(slug: str):
    """Dynamically import a scraper class by slug."""
    import importlib
    module_path, class_name = SCRAPER_REGISTRY[slug].rsplit(".", 1)
    module = importlib.import_module(module_path)
    return getattr(module, class_name)


@app.task(bind=True, name="nyumbacheck.jobs.tasks.scraper_tasks.run_scraper")
def run_scraper(self, platform_slug: str, job_type: str = "incremental") -> dict:
    """
    Run a platform scraper and persist the results.

    Args:
        platform_slug: e.g. "buyrentkenya"
        job_type: "incremental" or "full"
    """
    log.info("scraper_task.started", platform=platform_slug, job_type=job_type)

    try:
        scraper_class = _import_scraper(platform_slug)
    except (KeyError, ImportError) as exc:
        log.error("scraper_task.unknown_platform", platform=platform_slug, error=str(exc))
        raise

    async def _run():
        scraper = scraper_class()
        count = 0
        async for listing in scraper.run():
            # TODO: persist listing to DB via SQLAlchemy session
            log.debug("scraper_task.listing", url=listing.url, platform=listing.platform_slug)
            count += 1
        return count

    try:
        count = asyncio.run(_run())
        log.info("scraper_task.complete", platform=platform_slug, count=count)
        return {"platform": platform_slug, "listings_scraped": count, "status": "success"}
    except Exception as exc:
        log.error("scraper_task.failed", platform=platform_slug, error=str(exc))
        raise self.retry(exc=exc, countdown=300)
