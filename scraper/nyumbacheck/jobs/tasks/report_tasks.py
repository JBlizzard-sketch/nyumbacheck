"""
Celery task: process a fraud report request end-to-end.

Pipeline:
1. Mark report as "processing"
2. Find or scrape the listing from the input URL/address
3. Run duplicate detection against the full database
4. Compute an explainable fraud score
5. Generate an HTML report
6. Send the report by email
7. Mark report as "complete" and store the report URL
"""

import asyncio
from datetime import datetime, timezone

from nyumbacheck.jobs.celery_app import app
from nyumbacheck.utils.logger import get_logger
from nyumbacheck.pipeline.fraud.scorer import compute_fraud_score
from nyumbacheck.report.generator import generate_html_report
from nyumbacheck.report.emailer import send_report_email

log = get_logger(__name__)


@app.task(bind=True, name="nyumbacheck.jobs.tasks.report_tasks.process_report_request")
def process_report_request(self, report_id: int) -> dict:
    """
    Full report processing pipeline for a single report request.
    """
    log.info("report_task.started", report_id=report_id)

    try:
        return asyncio.run(_run_report(self, report_id))
    except Exception as exc:
        log.error("report_task.failed", report_id=report_id, error=str(exc))
        asyncio.run(_mark_failed(report_id, str(exc)))
        raise self.retry(exc=exc, countdown=120, max_retries=2)


async def _run_report(task, report_id: int) -> dict:
    """Async implementation of the report pipeline."""

    # Step 1: Load the report request from DB
    report = await _load_report(report_id)
    if not report:
        raise ValueError(f"Report {report_id} not found")

    await _update_status(report_id, "processing")
    log.info("report_task.processing", report_id=report_id, input=report.get("input_url") or report.get("input_address"))

    # Step 2: Resolve the listing
    listing_data = await _resolve_listing(report)
    log.info("report_task.listing_resolved", report_id=report_id, found=listing_data is not None)

    # Step 3: Find duplicates
    duplicates = await _find_duplicates(listing_data) if listing_data else []
    log.info("report_task.duplicates_found", report_id=report_id, count=len(duplicates))

    # Step 4: Compute fraud score
    fraud_result = _compute_score(listing_data, duplicates)
    log.info("report_task.score_computed", report_id=report_id, score=fraud_result.score, risk=fraud_result.risk_level)

    # Step 5: Generate HTML report
    report_html = generate_html_report(
        report_id=report_id,
        input_url=report.get("input_url"),
        input_address=report.get("input_address"),
        listing=listing_data,
        duplicates=duplicates,
        fraud_result=fraud_result,
        generated_at=datetime.now(timezone.utc),
    )

    # Step 6: Send email
    email = report["email"]
    await send_report_email(
        to_email=email,
        report_id=report_id,
        report_html=report_html,
        fraud_score=fraud_result.score,
        risk_level=fraud_result.risk_level,
        summary=fraud_result.summary,
    )
    log.info("report_task.email_sent", report_id=report_id, email=email)

    # Step 7: Mark complete
    await _mark_complete(report_id, report_html, fraud_result)
    log.info("report_task.complete", report_id=report_id)

    return {
        "report_id": report_id,
        "score": fraud_result.score,
        "risk_level": fraud_result.risk_level,
        "duplicates": len(duplicates),
        "status": "complete",
    }


async def _load_report(report_id: int) -> dict | None:
    """Load the report request from the database."""
    try:
        import asyncpg
        from nyumbacheck.utils.config import settings
        # Strip the +asyncpg suffix for raw asyncpg
        db_url = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
        conn = await asyncpg.connect(db_url)
        try:
            row = await conn.fetchrow(
                "SELECT id, input_url, input_address, input_type, email, status FROM report_requests WHERE id = $1",
                report_id
            )
            return dict(row) if row else None
        finally:
            await conn.close()
    except Exception as exc:
        log.warning("report_task.db_load_failed", error=str(exc))
        return {"id": report_id, "input_url": None, "input_address": None, "email": "unknown@example.com", "status": "pending"}


async def _update_status(report_id: int, status: str) -> None:
    """Update the report request status."""
    try:
        import asyncpg
        from nyumbacheck.utils.config import settings
        db_url = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
        conn = await asyncpg.connect(db_url)
        try:
            await conn.execute(
                "UPDATE report_requests SET status = $1, updated_at = NOW() WHERE id = $2",
                status, report_id
            )
        finally:
            await conn.close()
    except Exception as exc:
        log.warning("report_task.status_update_failed", error=str(exc))


async def _mark_failed(report_id: int, reason: str) -> None:
    try:
        import asyncpg
        from nyumbacheck.utils.config import settings
        db_url = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
        conn = await asyncpg.connect(db_url)
        try:
            await conn.execute(
                "UPDATE report_requests SET status = 'failed', failure_reason = $1, updated_at = NOW() WHERE id = $2",
                reason[:500], report_id
            )
        finally:
            await conn.close()
    except Exception as exc:
        log.warning("report_task.mark_failed_error", error=str(exc))


async def _mark_complete(report_id: int, report_html: str, fraud_result) -> None:
    """Persist the final fraud score and mark the report complete."""
    try:
        import asyncpg
        from nyumbacheck.utils.config import settings
        import json
        db_url = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
        conn = await asyncpg.connect(db_url)
        try:
            # Insert fraud score
            signals_json = json.dumps([
                {
                    "type": s.type,
                    "label": s.label,
                    "description": s.description,
                    "weight": s.weight,
                    "score": s.score,
                    "rawValue": str(s.raw_value) if s.raw_value is not None else None,
                }
                for s in fraud_result.signals
            ])
            fraud_score_id = await conn.fetchval(
                """INSERT INTO fraud_scores
                   (score, risk_level, summary, signals,
                    platform_count_score, price_spread_score,
                    agent_phone_overlap_score, days_on_market_score,
                    image_reuse_score, price_anomaly_score,
                    computed_at, created_at, updated_at)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW(),NOW())
                   RETURNING id""",
                fraud_result.score,
                fraud_result.risk_level,
                fraud_result.summary,
                signals_json,
                fraud_result.platform_count_score,
                fraud_result.price_spread_score,
                fraud_result.agent_phone_overlap_score,
                fraud_result.days_on_market_score,
                fraud_result.image_reuse_score,
                fraud_result.price_anomaly_score,
            )

            await conn.execute(
                """UPDATE report_requests
                   SET status = 'complete', fraud_score_id = $1, updated_at = NOW()
                   WHERE id = $2""",
                fraud_score_id, report_id
            )
        finally:
            await conn.close()
    except Exception as exc:
        log.warning("report_task.mark_complete_failed", error=str(exc))


async def _resolve_listing(report: dict) -> dict | None:
    """
    Attempt to find or scrape the listing from the input URL or address.
    Returns a dict with listing fields, or None if not found.
    """
    input_url = report.get("input_url")
    input_address = report.get("input_address")

    if input_url:
        # Try to find by URL in the database first
        try:
            import asyncpg
            from nyumbacheck.utils.config import settings
            db_url = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
            conn = await asyncpg.connect(db_url)
            try:
                row = await conn.fetchrow(
                    """SELECT l.*, p.slug as platform_slug
                       FROM raw_listings l
                       JOIN platforms p ON l.platform_id = p.id
                       WHERE l.url = $1 LIMIT 1""",
                    input_url
                )
                if row:
                    return dict(row)
            finally:
                await conn.close()
        except Exception as exc:
            log.warning("report_task.url_lookup_failed", error=str(exc))

        # If not in DB, attempt a live scrape of the URL
        return await _scrape_single_url(input_url)

    elif input_address:
        # Search by normalised address
        from nyumbacheck.pipeline.address.normaliser import extract_neighbourhood, normalise_address
        neighbourhood = extract_neighbourhood(input_address)
        normalised = normalise_address(input_address)
        return {
            "url": None,
            "title": None,
            "raw_address": input_address,
            "normalised_address": normalised,
            "neighbourhood": neighbourhood,
            "price_ksh": None,
            "bedrooms": None,
            "agent_raw_phone": None,
            "image_hashes": [],
            "platform_slug": "unknown",
        }

    return None


async def _scrape_single_url(url: str) -> dict | None:
    """Determine which platform the URL belongs to and scrape it."""
    from nyumbacheck.utils.logger import get_logger
    log = get_logger(__name__)

    if "buyrentkenya.com" in url:
        from nyumbacheck.scrapers.buyrentkenya.scraper import BuyRentKenyaScraper
        scraper = BuyRentKenyaScraper()
    elif "jumia.co.ke" in url or "house.jumia" in url:
        from nyumbacheck.scrapers.jumiahouseske.scraper import JumiaHousesKeScraper
        scraper = JumiaHousesKeScraper()
    else:
        log.warning("report_task.unknown_platform", url=url)
        return None

    try:
        listing = await scraper.scrape_listing(url)
        if listing:
            return {
                "url": listing.url,
                "title": listing.title,
                "raw_address": listing.raw_address,
                "normalised_address": listing.raw_address,
                "neighbourhood": listing.neighbourhood,
                "price_ksh": listing.price_ksh,
                "bedrooms": listing.bedrooms,
                "agent_raw_phone": listing.agent_phone,
                "image_hashes": [],
                "platform_slug": listing.platform_slug,
            }
    except Exception as exc:
        log.warning("report_task.scrape_failed", url=url, error=str(exc))
    return None


async def _find_duplicates(listing: dict) -> list[dict]:
    """Find other listings that appear to be the same property."""
    if not listing:
        return []

    neighbourhood = listing.get("neighbourhood")
    if not neighbourhood:
        return []

    try:
        import asyncpg
        from nyumbacheck.utils.config import settings
        db_url = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
        conn = await asyncpg.connect(db_url)
        try:
            rows = await conn.fetch(
                """SELECT l.url, l.price_ksh, l.agent_raw_phone, p.slug as platform_slug
                   FROM raw_listings l
                   JOIN platforms p ON l.platform_id = p.id
                   WHERE l.neighbourhood = $1
                     AND l.is_active = true
                     AND l.bedrooms IS NOT DISTINCT FROM $2
                   LIMIT 50""",
                neighbourhood,
                listing.get("bedrooms"),
            )
            # Exclude the listing itself
            own_url = listing.get("url")
            return [dict(r) for r in rows if r["url"] != own_url]
        finally:
            await conn.close()
    except Exception as exc:
        log.warning("report_task.duplicate_search_failed", error=str(exc))
        return []


def _compute_score(listing: dict | None, duplicates: list[dict]):
    """Compute fraud score from listing data and found duplicates."""
    if not listing and not duplicates:
        return compute_fraud_score()

    platform_count = len({d.get("platform_slug") for d in duplicates}) + 1 if duplicates else 1

    prices = [d["price_ksh"] for d in duplicates if d.get("price_ksh")]
    if listing and listing.get("price_ksh"):
        prices.append(listing["price_ksh"])

    price_min = min(prices) if prices else 0
    price_max = max(prices) if prices else 0

    # Count listings for this agent phone
    agent_phone = listing.get("agent_raw_phone") if listing else None
    agent_listing_count = sum(
        1 for d in duplicates
        if d.get("agent_raw_phone") == agent_phone and agent_phone
    ) if agent_phone else 0

    return compute_fraud_score(
        platform_count=platform_count,
        price_min=price_min,
        price_max=price_max,
        agent_listing_count=agent_listing_count,
        days_on_market=0,
        image_match_count=0,
        total_images=0,
    )
