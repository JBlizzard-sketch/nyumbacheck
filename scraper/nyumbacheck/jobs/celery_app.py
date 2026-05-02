"""Celery application and task scheduler configuration."""

from celery import Celery
from celery.schedules import crontab
from nyumbacheck.utils.config import settings

app = Celery(
    "nyumbacheck",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=[
        "nyumbacheck.jobs.tasks.scraper_tasks",
        "nyumbacheck.jobs.tasks.pipeline_tasks",
    ],
)

app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Africa/Nairobi",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    # Retry failed tasks up to 3 times with exponential backoff
    task_max_retries=3,
    task_default_retry_delay=60,
)

# Periodic schedule (Celery Beat)
app.conf.beat_schedule = {
    # Run incremental scrapes daily at 3am Nairobi time
    "scrape-buyrentkenya-daily": {
        "task": "nyumbacheck.jobs.tasks.scraper_tasks.run_scraper",
        "schedule": crontab(hour=3, minute=0),
        "args": ["buyrentkenya", "incremental"],
    },
    "scrape-jumiahouseske-daily": {
        "task": "nyumbacheck.jobs.tasks.scraper_tasks.run_scraper",
        "schedule": crontab(hour=3, minute=30),
        "args": ["jumiahouseske", "incremental"],
    },
    # Run full dedup + fraud score pipeline at 5am daily
    "run-dedup-pipeline-daily": {
        "task": "nyumbacheck.jobs.tasks.pipeline_tasks.run_dedup_pipeline",
        "schedule": crontab(hour=5, minute=0),
        "args": [],
    },
    # Refresh market snapshots at 6am daily
    "refresh-market-snapshots-daily": {
        "task": "nyumbacheck.jobs.tasks.pipeline_tasks.refresh_market_snapshots",
        "schedule": crontab(hour=6, minute=0),
        "args": [],
    },
    # Full scrape every Sunday at 1am
    "scrape-buyrentkenya-full-weekly": {
        "task": "nyumbacheck.jobs.tasks.scraper_tasks.run_scraper",
        "schedule": crontab(hour=1, minute=0, day_of_week=0),
        "args": ["buyrentkenya", "full"],
    },
}
