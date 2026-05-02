"""Celery tasks for the dedup + fraud scoring pipeline."""

from nyumbacheck.jobs.celery_app import app
from nyumbacheck.utils.logger import get_logger

log = get_logger(__name__)


@app.task(name="nyumbacheck.jobs.tasks.pipeline_tasks.run_dedup_pipeline")
def run_dedup_pipeline() -> dict:
    """
    Run the full deduplication pipeline.

    For each neighbourhood:
    1. Load recent active listings
    2. Run dedup engine (address + image + agent phone matching)
    3. Persist dedup clusters
    4. Compute fraud scores for each cluster
    """
    log.info("pipeline.dedup.started")
    # TODO: implement with DB queries once SQLAlchemy session is wired
    log.info("pipeline.dedup.complete")
    return {"status": "success"}


@app.task(name="nyumbacheck.jobs.tasks.pipeline_tasks.refresh_market_snapshots")
def refresh_market_snapshots() -> dict:
    """
    Refresh daily market snapshot data for all tracked neighbourhoods.

    Computes: median price, price per sqft, days on market, listing velocity,
    duplicate rate, fraud stats — all written to market_snapshots table.
    """
    log.info("pipeline.market_snapshots.started")
    # TODO: implement with DB queries
    log.info("pipeline.market_snapshots.complete")
    return {"status": "success"}
