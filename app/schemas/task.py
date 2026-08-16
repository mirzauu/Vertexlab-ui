"""
Task request/response schemas.
"""

from uuid import UUID
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, model_validator

from app.models.task import TaskStatus, FileType

class TaskCreate(BaseModel):
    """Create a new task."""
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    tags: List[str] = Field(default_factory=list)


class AIDocumentTaskRead(BaseModel):
    id: UUID
    version: int
    chunk_count: int = 0
    verified_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def from_document(cls, doc):
        """Build from an AIDocument ORM instance, using pre-computed counts from the DB."""
        return cls(
            id=doc.id,
            version=doc.version,
            chunk_count=getattr(doc, "chunk_count", 0),
            verified_count=getattr(doc, "verified_count", 0),
            created_at=doc.created_at,
        )


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
    ai_documents: Optional[List[AIDocumentTaskRead]] = []

    model_config = {"from_attributes": True}

    @model_validator(mode="wrap")
    @classmethod
    def _convert_ai_documents(cls, values, handler):
        """Convert ORM AIDocument objects into lightweight AIDocumentTaskRead
        with pre-computed chunk_count and verified_count without triggering lazy loading."""
        if hasattr(values, "__dict__"):
            # Construct a dictionary from the instance __dict__, excluding private attributes
            data = {k: v for k, v in values.__dict__.items() if not k.startswith("_")}
            
            docs = None
            is_loaded = False
            if "ai_documents" in values.__dict__:
                val = values.__dict__["ai_documents"]
                if isinstance(val, (list, tuple, set)):
                    docs = val
                    is_loaded = True

            if is_loaded and docs:
                try:
                    converted = []
                    for d in docs:
                        if hasattr(d, "chunk_count"):
                            converted.append(AIDocumentTaskRead.from_document(d))
                        elif hasattr(d, "corrected_chunks"):
                            converted.append(AIDocumentTaskRead.from_document(d))
                        elif isinstance(d, dict):
                            chunks = d.get("corrected_chunks") or []
                            converted.append(AIDocumentTaskRead(
                                id=d.get("id"),
                                version=d.get("version", 1),
                                chunk_count=d.get("chunk_count") if d.get("chunk_count") is not None else len(chunks),
                                verified_count=d.get("verified_count") if d.get("verified_count") is not None else sum(1 for c in chunks if c.get("is_verified")),
                                created_at=d.get("created_at")
                            ))
                        else:
                            converted.append(d)
                    data["ai_documents"] = converted
                except (IndexError, TypeError):
                    data["ai_documents"] = []
            else:
                data["ai_documents"] = []

            # Prevent lazy loading of files relation if not loaded
            if "files" not in values.__dict__:
                data["files"] = []

            return handler(data)

        elif isinstance(values, dict):
            data = dict(values)
            docs = data.get("ai_documents")
            if isinstance(docs, (list, tuple, set)) and docs:
                try:
                    converted = []
                    for d in docs:
                        if hasattr(d, "chunk_count"):
                            converted.append(AIDocumentTaskRead.from_document(d))
                        elif hasattr(d, "corrected_chunks"):
                            converted.append(AIDocumentTaskRead.from_document(d))
                        elif isinstance(d, dict):
                            chunks = d.get("corrected_chunks") or []
                            converted.append(AIDocumentTaskRead(
                                id=d.get("id"),
                                version=d.get("version", 1),
                                chunk_count=d.get("chunk_count") if d.get("chunk_count") is not None else len(chunks),
                                verified_count=d.get("verified_count") if d.get("verified_count") is not None else sum(1 for c in chunks if c.get("is_verified")),
                                created_at=d.get("created_at")
                            ))
                        else:
                            converted.append(d)
                    data["ai_documents"] = converted
                except (IndexError, TypeError):
                    data["ai_documents"] = []
            elif "ai_documents" not in data:
                data["ai_documents"] = []

            if "files" not in data:
                data["files"] = []

            return handler(data)

        # Fallback for other objects (avoid lazy loading where possible)
        return handler(values)

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
    cloudinary_public_id: Optional[str] = None
    cloudinary_url: Optional[str] = None

    model_config = {"from_attributes": True}


class UploadSignatureRequest(BaseModel):
    """Request a signed upload payload for Cloudinary."""
    file_name: str
    file_type: FileType = FileType.RAW_DATA


class UploadSignatureResponse(BaseModel):
    """Response containing signed parameters for direct upload to Cloudinary."""
    signature: str
    timestamp: int
    api_key: str
    cloud_name: str
    folder: str
    resource_type: str


class RegisterAudioRequest(BaseModel):
    """Register an audio file uploaded directly to Cloudinary."""
    cloudinary_public_id: str
    cloudinary_url: str
    file_name: str
    file_size: int
    mime_type: Optional[str] = "audio/mpeg"


class RegisterDocumentRequest(BaseModel):
    """Register a document uploaded directly to Cloudinary."""
    cloudinary_public_id: str
    cloudinary_url: str
    file_name: str
    file_size: int
    mime_type: Optional[str] = "application/pdf"
    examination_start_page: Optional[int] = None


class TaskListResponse(BaseModel):
    """Paginated list of tasks."""
    items: List[TaskRead]
    total: int
    page: int
    page_size: int
