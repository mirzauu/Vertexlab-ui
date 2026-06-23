"""
PipelineRun and PipelineStep ORM models.
"""

import uuid
import enum
from datetime import datetime
from sqlalchemy import String, Integer, Text, Enum, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, UUIDMixin


class PipelineStatus(str, enum.Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class StepStatus(str, enum.Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"


class PipelineRun(Base, UUIDMixin):
    __tablename__ = "pipeline_runs"

    task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    status: Mapped[PipelineStatus] = mapped_column(
        Enum(PipelineStatus, name="pipeline_status_enum"), default=PipelineStatus.QUEUED
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    task: Mapped["Task"] = relationship("Task", back_populates="pipeline_run")
    steps: Mapped[list["PipelineStep"]] = relationship(
        "PipelineStep", back_populates="pipeline_run", cascade="all, delete-orphan",
        order_by="PipelineStep.step_order"
    )


class PipelineStep(Base, UUIDMixin):
    __tablename__ = "pipeline_steps"

    pipeline_run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pipeline_runs.id", ondelete="CASCADE"), nullable=False
    )
    step_name: Mapped[str] = mapped_column(String(50), nullable=False)
    step_order: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[StepStatus] = mapped_column(
        Enum(StepStatus, name="step_status_enum"), default=StepStatus.PENDING
    )
    metadata_json: Mapped[dict] = mapped_column("metadata", JSONB, default=dict)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    pipeline_run: Mapped["PipelineRun"] = relationship("PipelineRun", back_populates="steps")


# Forward reference
from app.models.task import Task  # noqa: E402, F401
