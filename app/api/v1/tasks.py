"""
Tasks router: CRUD + file management, scoped to organizations.
"""

from uuid import UUID
from typing import Optional, List
import os

from fastapi import APIRouter, Depends, UploadFile, File, Query, HTTPException
from deepgram import DeepgramClient

from app.config import settings
from app.core.dependencies import get_current_user, get_current_org, get_task_service, get_file_service, get_pipeline_repository, get_billing_service
from app.services.billing_service import BillingService
from app.models.user import User
from app.models.organization import Organization
from app.models.task import TaskStatus, FileType
from app.models.transcript import Transcript
from app.repositories.pipeline_repo import PipelineRepository
from app.services.task_service import TaskService
from app.services.file_service import FileService
from app.schemas.task import TaskCreate, TaskRead, TaskUpdate, TaskListResponse, TaskFileRead
from app.schemas.auth import MessageResponse

router = APIRouter(prefix="/organizations/{org_id}/tasks", tags=["Tasks"])


@router.post("/", response_model=TaskRead, status_code=201)
async def create_task(
    org_id: UUID,
    data: TaskCreate,
    current_user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    service: TaskService = Depends(get_task_service),
):
    """Create a new task within an organization."""
    return await service.create_task(org_id, data, current_user)


@router.get("/", response_model=TaskListResponse)
async def list_tasks(
    org_id: UUID,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    status: Optional[TaskStatus] = None,
    search: Optional[str] = None,
    org: Organization = Depends(get_current_org),
    service: TaskService = Depends(get_task_service),
):
    """List tasks for an organization with pagination and filters."""
    return await service.list_tasks(
        org_id=org_id,
        page=page,
        page_size=page_size,
        status=status,
        search=search,
    )


@router.get("/{task_id}", response_model=TaskRead)
async def get_task(
    org_id: UUID,
    task_id: UUID,
    org: Organization = Depends(get_current_org),
    service: TaskService = Depends(get_task_service),
):
    """Get a specific task."""
    return await service.get_task(task_id, org_id)


@router.put("/{task_id}", response_model=TaskRead)
async def update_task(
    org_id: UUID,
    task_id: UUID,
    data: TaskUpdate,
    org: Organization = Depends(get_current_org),
    service: TaskService = Depends(get_task_service),
):
    """Update a task."""
    return await service.update_task(task_id, org_id, data)


@router.delete("/{task_id}", response_model=MessageResponse)
async def delete_task(
    org_id: UUID,
    task_id: UUID,
    org: Organization = Depends(get_current_org),
    service: TaskService = Depends(get_task_service),
):
    """Delete a task."""
    await service.delete_task(task_id, org_id)
    return MessageResponse(message="Task deleted successfully")


# --- Task Files ---


@router.post("/{task_id}/files", response_model=TaskFileRead, status_code=201)
async def upload_file(
    org_id: UUID,
    task_id: UUID,
    file: UploadFile = File(...),
    org: Organization = Depends(get_current_org),
    task_service: TaskService = Depends(get_task_service),
    file_service: FileService = Depends(get_file_service),
    pipeline_repo: PipelineRepository = Depends(get_pipeline_repository),
):
    """Upload a file to a task. If it's an audio file, transcribe it via Deepgram."""
    # Detect file type from MIME
    mime = file.content_type or "application/octet-stream"
    file_type = file_service.detect_file_type(mime)

    if file_type != FileType.AUDIO:
        raise HTTPException(status_code=400, detail="Only audio files are allowed")

    # Save to disk
    relative_path, file_size = await file_service.save_upload(file, file_type)

    # Transcribe via Deepgram
    absolute_path = file_service.get_absolute_path(relative_path)
    client = DeepgramClient(api_key=settings.DEEPGRAM_API_KEY)
    with open(absolute_path, "rb") as audio_file:
        response = client.listen.v1.media.transcribe_file(
            request=audio_file.read(),
            model="nova-3",
            smart_format=True,
            diarize=True,
            numerals=False
        )

    result = response.results.channels[0].alternatives[0]
    chunks = []
    if hasattr(result, 'paragraphs') and result.paragraphs and result.paragraphs.paragraphs:
        for i, para in enumerate(result.paragraphs.paragraphs):
            speaker_id = getattr(para, 'speaker', 0)
            speaker_label = f"SPEAKER_{int(speaker_id):02d}"
            para_text = ""
            if hasattr(para, 'sentences') and para.sentences:
                para_text = " ".join(s.text for s in para.sentences if hasattr(s, 'text') and s.text).strip()
            
            chunks.append({
                "raw_chunk_id": i + 1,
                "raw_chunk_text": para_text,
                "audio_start_time_sec": para.start,
                "audio_end_time_sec": para.end,
                "speakers": [speaker_label]
            })
    else:
        end_time = 0.0
        if hasattr(result, 'words') and result.words:
            end_time = result.words[-1].end
        chunks.append({
            "raw_chunk_id": 1,
            "raw_chunk_text": result.transcript,
            "audio_start_time_sec": 0.0,
            "audio_end_time_sec": end_time,
            "speakers": ["SPEAKER_00"]
        })

    # Save transcript to DB
    existing_transcript = await pipeline_repo.get_transcript(task_id)
    if existing_transcript:
        existing_transcript.content = chunks
        existing_transcript.confidence_score = result.confidence if hasattr(result, 'confidence') else None
        await pipeline_repo.db.flush()
    else:
        transcript = Transcript(
            task_id=task_id,
            content=chunks,
            language="en",
            confidence_score=result.confidence if hasattr(result, 'confidence') else None
        )
        await pipeline_repo.save_transcript(transcript)

    # Register in database
    return await task_service.add_file(
        task_id=task_id,
        org_id=org_id,
        file_name=file.filename or "unnamed",
        file_path=relative_path,
        file_type=file_type,
        file_size=file_size,
        mime_type=mime,
    )


@router.post("/{task_id}/documents", response_model=TaskFileRead, status_code=201)
async def upload_document(
    org_id: UUID,
    task_id: UUID,
    file: UploadFile = File(...),
    examination_start_page: Optional[int] = Query(None, ge=1),
    org: Organization = Depends(get_current_org),
    task_service: TaskService = Depends(get_task_service),
    file_service: FileService = Depends(get_file_service),
    billing_service: BillingService = Depends(get_billing_service),
):
    """Upload a raw document to a task."""
    mime = file.content_type or "application/octet-stream"
    file_type = file_service.detect_file_type(mime)

    if file_type == FileType.AUDIO:
        raise HTTPException(status_code=400, detail="Use the /files endpoint for audio files")

    # Save to disk
    relative_path, file_size = await file_service.save_upload(file, file_type)

    # Detect page count for PDF documents
    page_count = None
    import os
    from app.config import settings
    full_path = os.path.join(settings.STORAGE_PATH, relative_path)
    
    if file.filename and file.filename.lower().endswith(".pdf"):
        try:
            import fitz
            doc = fitz.open(os.path.abspath(full_path))
            page_count = doc.page_count
            doc.close()
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Failed to extract page count from PDF: {e}")

    # Process deposition (split into cover and examination manually if page number is provided)
    exam_task_file = None
    if examination_start_page is not None:
        try:
            from app.services.deposition_splitter import split_at_page
            split_result = split_at_page(os.path.abspath(full_path), examination_start_page, os.path.abspath(settings.STORAGE_PATH))
            
            if split_result:
                # Create TaskFile for Cover (with page_count=None so it doesn't count in total_pages metrics)
                cover_abs_path = os.path.join(settings.STORAGE_PATH, split_result.cover_pdf_path)
                cover_size = os.path.getsize(cover_abs_path) if os.path.exists(cover_abs_path) else 0
                await task_service.add_file(
                    task_id=task_id,
                    org_id=org_id,
                    file_name=os.path.basename(split_result.cover_pdf_path),
                    file_path=split_result.cover_pdf_path,
                    file_type=file_type,
                    file_size=cover_size,
                    mime_type="application/pdf",
                    page_count=None,
                )

                # Create TaskFile for Examination (with page_count=split_result.exam_page_count)
                exam_abs_path = os.path.join(settings.STORAGE_PATH, split_result.examination_pdf_path)
                exam_size = os.path.getsize(exam_abs_path) if os.path.exists(exam_abs_path) else 0
                exam_task_file = await task_service.add_file(
                    task_id=task_id,
                    org_id=org_id,
                    file_name=os.path.basename(split_result.examination_pdf_path),
                    file_path=split_result.examination_pdf_path,
                    file_type=file_type,
                    file_size=exam_size,
                    mime_type="application/pdf",
                    page_count=split_result.exam_page_count,
                )
                
                # Set page_count to None so original file registers with null page count
                page_count = None
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Failed to split deposition: {e}")

    # Register in database
    task_file = await task_service.add_file(
        task_id=task_id,
        org_id=org_id,
        file_name=file.filename or "unnamed",
        file_path=relative_path,
        file_type=file_type,
        file_size=file_size,
        mime_type=mime,
        page_count=page_count,
    )

    # Record billing usage
    if exam_task_file and exam_task_file.page_count:
        await billing_service.record_usage(
            org_id=org_id,
            task_id=task_id,
            file_id=exam_task_file.id,
            pages=exam_task_file.page_count,
        )
    elif page_count and page_count > 0:
        await billing_service.record_usage(
            org_id=org_id,
            task_id=task_id,
            file_id=task_file.id,
            pages=page_count,
        )

    return task_file


@router.get("/{task_id}/files", response_model=List[TaskFileRead])
async def list_files(
    org_id: UUID,
    task_id: UUID,
    org: Organization = Depends(get_current_org),
    service: TaskService = Depends(get_task_service),
):
    """List all files for a task."""
    return await service.list_files(task_id, org_id)
