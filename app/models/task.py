"""
Task and TaskFile ORM models.
"""

import uuid
import enum
from datetime import datetime
from sqlalchemy import String, Text, BigInteger, Enum, DateTime, ForeignKey, func, Integer
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, UUIDMixin, TimestampMixin


class TaskStatus(str, enum.Enum):
    QUEUED = "queued"
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"


class FileType(str, enum.Enum):
    AUDIO = "audio"
    RAW_DATA = "raw_data"
    OUTPUT = "output"


class Task(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "tasks"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[TaskStatus] = mapped_column(
        Enum(TaskStatus, name="task_status_enum"), default=TaskStatus.QUEUED
    )
    tags: Mapped[dict] = mapped_column(JSONB, default=list)

    # Relationships
    organization: Mapped["Organization"] = relationship("Organization", back_populates="tasks")
    creator: Mapped["User"] = relationship("User", foreign_keys=[created_by])
    files: Mapped[list["TaskFile"]] = relationship(
        "TaskFile", back_populates="task", cascade="all, delete-orphan"
    )
    pipeline_run: Mapped["PipelineRun | None"] = relationship(
        "PipelineRun", back_populates="task", uselist=False, cascade="all, delete-orphan"
    )
    transcript: Mapped["Transcript | None"] = relationship(
        "Transcript", back_populates="task", uselist=False, cascade="all, delete-orphan"
    )
    ai_documents: Mapped[list["AIDocument"]] = relationship(
        "AIDocument", back_populates="task", cascade="all, delete-orphan"
    )


class TaskFile(Base, UUIDMixin):
    __tablename__ = "task_files"

    task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(Text, nullable=False)
    file_type: Mapped[FileType] = mapped_column(
        Enum(FileType, name="file_type_enum"), nullable=False
    )
    file_size: Mapped[int] = mapped_column(BigInteger, nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    page_count: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Relationships
    task: Mapped["Task"] = relationship("Task", back_populates="files")


# Forward references
from app.models.organization import Organization  # noqa: E402, F401
from app.models.user import User  # noqa: E402, F401
from app.models.pipeline import PipelineRun  # noqa: E402, F401
from app.models.transcript import Transcript  # noqa: E402, F401
from app.models.ai_document import AIDocument  # noqa: E402, F401
