"""
FastAPI routes for the fraud report processing pipeline.
Called by the Node.js API server to trigger async report processing.
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel, EmailStr
from nyumbacheck.utils.logger import get_logger

router = APIRouter(prefix="/reports", tags=["reports"])
log = get_logger(__name__)


class ProcessReportRequest(BaseModel):
    email: EmailStr | None = None


@router.post("/process/{report_id}")
async def process_report(
    report_id: int,
    background_tasks: BackgroundTasks,
) -> dict:
    """
    Trigger processing for a fraud report request.
    Enqueues a Celery task to run the full pipeline.
    """
    log.info("report.process_triggered", report_id=report_id)
    background_tasks.add_task(_enqueue_report_task, report_id)
    return {"report_id": report_id, "status": "queued"}


async def _enqueue_report_task(report_id: int) -> None:
    """Enqueue the report processing Celery task."""
    try:
        from nyumbacheck.jobs.tasks.report_tasks import process_report_request
        task = process_report_request.delay(report_id)
        log.info("report.task_enqueued", report_id=report_id, task_id=task.id)
    except Exception as exc:
        log.error("report.enqueue_failed", report_id=report_id, error=str(exc))
