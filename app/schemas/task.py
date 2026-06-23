"""
Task request/response schemas.
"""

from uuid import UUID
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field

from app.models.task import TaskStatus, FileType


class TaskCreate(BaseModel):
    """Create a new task."""
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    tags: List[str] = Field(default_factory=list)


class TaskRead(BaseModel):
    """Task details."""
    id: UUID
    organization_id: UUID
    created_by: UUID
    name: str
    description: Optional[str] = None
    status: TaskStatus
    tags: list
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

class TaskReadWithFiles(TaskRead):
    """Task details including files."""
    files: List["TaskFileRead"] = []

    model_config = {"from_attributes": True}
class TaskUpdate(BaseModel):
    """Update task fields."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    status: Optional[TaskStatus] = None
    tags: Optional[List[str]] = None


class TaskFileRead(BaseModel):
    """Task file details."""
    id: UUID
    task_id: UUID
    file_name: str
    file_path: str
    file_type: FileType
    file_size: int
    mime_type: str
    uploaded_at: datetime
    page_count: Optional[int] = None

    model_config = {"from_attributes": True}


class TaskListResponse(BaseModel):
    """Paginated list of tasks."""
    items: List[TaskRead]
    total: int
    page: int
    page_size: int
