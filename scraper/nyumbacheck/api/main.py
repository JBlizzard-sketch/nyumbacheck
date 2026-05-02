"""FastAPI application — Python scraper API."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from nyumbacheck.utils.config import settings
from nyumbacheck.utils.logger import configure_logging, get_logger

configure_logging()
log = get_logger(__name__)

app = FastAPI(
    title="NyumbaCheck Scraper API",
    version="0.1.0",
    description="Internal API for the NyumbaCheck scraper and pipeline",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "version": "0.1.0"}


@app.post("/scraper/run/{platform_slug}")
async def trigger_scraper(platform_slug: str, job_type: str = "incremental") -> dict:
    """Manually trigger a scraper run (fires a Celery task)."""
    from nyumbacheck.jobs.tasks.scraper_tasks import run_scraper
    task = run_scraper.delay(platform_slug, job_type)
    log.info("api.scraper_triggered", platform=platform_slug, task_id=task.id)
    return {"task_id": task.id, "platform": platform_slug, "job_type": job_type}


@app.post("/pipeline/dedup")
async def trigger_dedup() -> dict:
    """Manually trigger the dedup pipeline."""
    from nyumbacheck.jobs.tasks.pipeline_tasks import run_dedup_pipeline
    task = run_dedup_pipeline.delay()
    return {"task_id": task.id}


@app.post("/pipeline/market-snapshots")
async def trigger_market_snapshots() -> dict:
    """Manually trigger market snapshot refresh."""
    from nyumbacheck.jobs.tasks.pipeline_tasks import refresh_market_snapshots
    task = refresh_market_snapshots.delay()
    return {"task_id": task.id}
