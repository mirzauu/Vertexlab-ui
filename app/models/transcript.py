"""
Transcript ORM model.
"""

import uuid
from datetime import datetime
from sqlalchemy import String, Numeric, DateTime, ForeignKey, func, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, UUIDMixin


class Transcript(Base, UUIDMixin):
    __tablename__ = "transcripts"

    task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    content: Mapped[dict | None] = mapped_column(JSONB, nullable=True)  # [{timestamp, speaker, text}]
    cleaned_content: Mapped[str | None] = mapped_column(Text, nullable=True)
    chunks: Mapped[list[dict] | None] = mapped_column(JSONB, nullable=True)
    matches: Mapped[list[dict] | None] = mapped_column(JSONB, nullable=True)
    language: Mapped[str] = mapped_column(String(10), default="en")
    confidence_score: Mapped[float | None] = mapped_column(Numeric(5, 4), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    task: Mapped["Task"] = relationship("Task", back_populates="transcript")


# Forward reference
from app.models.task import Task  # noqa: E402, F401
