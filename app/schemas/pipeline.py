"""
Pipeline request/response schemas.
"""

from uuid import UUID
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel

from app.models.pipeline import PipelineStatus, StepStatus
from app.schemas.task import TaskReadWithFiles


class PipelineStepRead(BaseModel):
    """Pipeline step status."""
    id: UUID
    step_name: str
    step_order: int
    status: StepStatus
    metadata_json: dict = {}
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class PipelineRunRead(BaseModel):
    """Pipeline run status with steps."""
    id: UUID
    task_id: UUID
    status: PipelineStatus
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None
    steps: List[PipelineStepRead] = []
    task: Optional["TaskReadWithFiles"] = None

    model_config = {"from_attributes": True}


class TranscriptRead(BaseModel):
    """Transcript data."""
    id: UUID
    task_id: UUID
    content: List[dict]
    language: str
    confidence_score: Optional[float] = None
    created_at: datetime

    model_config = {"from_attributes": True}



class AIDocumentRead(BaseModel):
    """AI-generated document."""
    id: UUID
    task_id: UUID
    title: str
    content: str
    version: int
    is_draft: bool
    parent_id: Optional[UUID] = None
    corrected_chunks: Optional[list[dict]] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AIDocumentUpdate(BaseModel):
    """Update an AI document (human-in-the-loop editing)."""
    title: Optional[str] = None
    content: Optional[str] = None
    corrected_chunks: Optional[list[dict]] = None


class PipelineStartResponse(BaseModel):
    """Response when a pipeline is triggered."""
    message: str
    pipeline_run_id: UUID

class PipelineDetailedResultRead(BaseModel):
    """Aggregated detailed output of pipeline matches."""
    audio_file_path: Optional[str] = None
    transcribed_data: Optional[list | dict] = None
    pdf_raw_data: Optional[list] = None
    metadata: Optional[dict] = None
    summary: Optional[dict] = None
    matches: Optional[list] = None
    document: Optional[AIDocumentRead] = None

