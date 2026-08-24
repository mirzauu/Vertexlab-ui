"""
Pipeline router: trigger, status, transcript, and document endpoints.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, BackgroundTasks, Response

from app.core.dependencies import get_current_org, get_pipeline_service
from app.models.organization import Organization
from app.services.pipeline_service import PipelineService
from app.schemas.pipeline import (
    PipelineRunRead,
    PipelineStartResponse,
    TranscriptRead,
    AIDocumentRead,
    AIDocumentUpdate,
    AIDocumentSaveResponse,
    PipelineDetailedResultRead,
    WorkstationRead,
)
from app.schemas.auth import MessageResponse

router = APIRouter(
    prefix="/organizations/{org_id}/tasks/{task_id}/pipeline",
    tags=["Pipeline"],
)


@router.post("/run", response_model=PipelineStartResponse, status_code=202)
async def trigger_pipeline(
    org_id: UUID,
    task_id: UUID,
    background_tasks: BackgroundTasks,
    org: Organization = Depends(get_current_org),
    service: PipelineService = Depends(get_pipeline_service),
):
    """Trigger pipeline execution for a task. Runs in the background."""
    pipeline_run = await service.trigger_pipeline(task_id, org_id)

    # Execute pipeline in background
    background_tasks.add_task(service.execute_pipeline, task_id, org_id)

    return PipelineStartResponse(
        message="Pipeline started successfully",
        pipeline_run_id=pipeline_run.id,
    )


@router.get("/status", response_model=PipelineRunRead)
async def get_pipeline_status(
    org_id: UUID,
    task_id: UUID,
    org: Organization = Depends(get_current_org),
    service: PipelineService = Depends(get_pipeline_service),
):
    """Get pipeline run status with step details."""
    return await service.get_status(task_id, org_id)


@router.get("/status/stream")
async def stream_pipeline_status(
    org_id: UUID,
    task_id: UUID,
    org: Organization = Depends(get_current_org),
):
    """
    Realtime Server-Sent Events (SSE) stream of pipeline status.
    
    Uses its own DB session to avoid FastAPI DI cleanup colliding
    with sse_starlette's scope cancellation on client disconnect.
    """
    from sse_starlette.sse import EventSourceResponse
    from app.db.session import AsyncSessionLocal

    async def _generate():
        import asyncio
        import json
        from app.models.pipeline import PipelineRun, PipelineStatus
        from app.models.task import Task
        from app.schemas.pipeline import PipelineRunRead
        from sqlalchemy import select
        from sqlalchemy.orm import selectinload

        try:
            while True:
                session = AsyncSessionLocal()
                try:
                    result = await session.execute(
                        select(PipelineRun)
                        .where(PipelineRun.task_id == task_id)
                        .options(
                            selectinload(PipelineRun.steps),
                        )
                    )
                    run = result.scalar_one_or_none()

                    if not run:
                        yield {"event": "error", "data": json.dumps({"detail": "Not found"})}
                        break

                    run.task = None  # Prevent lazy-load/MissingGreenlet error
                    run_schema = PipelineRunRead.model_validate(run)
                    yield {"event": "status", "data": run_schema.model_dump_json()}

                    if run.status in (PipelineStatus.COMPLETED, PipelineStatus.FAILED):
                        break
                finally:
                    try:
                        await asyncio.shield(session.close())
                    except Exception:
                        pass

                await asyncio.sleep(1.5)
        except asyncio.CancelledError:
            # Client disconnected — expected, not an error.
            pass

    return EventSourceResponse(_generate())


@router.get("/transcript", response_model=TranscriptRead)
async def get_transcript(
    org_id: UUID,
    task_id: UUID,
    org: Organization = Depends(get_current_org),
    service: PipelineService = Depends(get_pipeline_service),
):
    """Get the STT transcript for a task."""
    return await service.get_transcript(task_id, org_id)


@router.get("/document", response_model=AIDocumentRead)
async def get_document(
    org_id: UUID,
    task_id: UUID,
    org: Organization = Depends(get_current_org),
    service: PipelineService = Depends(get_pipeline_service),
):
    """Get the AI-generated document for a task."""
    return await service.get_document(task_id, org_id)


@router.put("/document", response_model=AIDocumentSaveResponse)
async def update_document(
    org_id: UUID,
    task_id: UUID,
    data: AIDocumentUpdate,
    org: Organization = Depends(get_current_org),
    service: PipelineService = Depends(get_pipeline_service),
):
    """Update the AI document (human-in-the-loop editing)."""
    return await service.update_document(task_id, org_id, data)


@router.post("/document/finalize", response_model=AIDocumentRead)
async def finalize_document(
    org_id: UUID,
    task_id: UUID,
    org: Organization = Depends(get_current_org),
    service: PipelineService = Depends(get_pipeline_service),
):
    """Mark the document as final."""
    return await service.finalize_document(task_id, org_id)


@router.get("/document/versions", response_model=list[AIDocumentRead])
async def get_document_versions(
    org_id: UUID,
    task_id: UUID,
    org: Organization = Depends(get_current_org),
    service: PipelineService = Depends(get_pipeline_service),
):
    """List all versions of the AI document (V1, V2, V3...)."""
    return await service.get_document_versions(task_id, org_id)


@router.get("/workstation", response_model=WorkstationRead)
async def get_workstation_data(
    org_id: UUID,
    task_id: UUID,
    org: Organization = Depends(get_current_org),
    service: PipelineService = Depends(get_pipeline_service),
):
    """
    Combined workstation payload for the Task Review page.

    Returns pipeline results (transcription, matches, document) AND the
    resolved audio file metadata in a single request — replacing the previous
    two-call pattern (pipeline/results + tasks/{id}/files).
    """
    return await service.get_workstation_data(task_id, org_id)


@router.get("/results", response_model=PipelineDetailedResultRead)
async def get_pipeline_results(
    org_id: UUID,
    task_id: UUID,
    org: Organization = Depends(get_current_org),
    service: PipelineService = Depends(get_pipeline_service),
):
    """Get detailed output of all pipeline steps combined."""
    return await service.get_detailed_results(task_id, org_id)


@router.get("/document/pdf")
async def get_document_pdf(
    org_id: UUID,
    task_id: UUID,
    org: Organization = Depends(get_current_org),
    service: PipelineService = Depends(get_pipeline_service),
):
    """Download the AI document as PDF."""
    pdf_bytes = await service.get_document_pdf(task_id, org_id)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=document_corrected_{task_id}.pdf"
        },
    )


@router.get("/document/word")
async def get_document_word(
    org_id: UUID,
    task_id: UUID,
    org: Organization = Depends(get_current_org),
    service: PipelineService = Depends(get_pipeline_service),
):
    """Download the AI document as Word DOCX."""
    docx_bytes = await service.get_document_word(task_id, org_id)
    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={
            "Content-Disposition": f"attachment; filename=document_corrected_{task_id}.docx"
        },
    )


@router.get("/document/word-tracked")
async def get_document_word_tracked(
    org_id: UUID,
    task_id: UUID,
    org: Organization = Depends(get_current_org),
    service: PipelineService = Depends(get_pipeline_service),
):
    """Download the AI document as Word DOCX with tracked changes (original vs AI-corrected)."""
    docx_bytes = await service.get_document_word_tracked(task_id, org_id)
    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={
            "Content-Disposition": f"attachment; filename=document_tracked_{task_id}.docx"
        },
    )

