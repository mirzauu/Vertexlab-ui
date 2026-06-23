"""
AIDocument ORM model.
"""

import uuid
from datetime import datetime
from sqlalchemy import String, Integer, Boolean, Text, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, UUIDMixin, TimestampMixin


class AIDocument(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "ai_documents"

    task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)  # HTML/rich text
    version: Mapped[int] = mapped_column(Integer, default=1)
    is_draft: Mapped[bool] = mapped_column(Boolean, default=True)

    # Version chain — V2 points to V1 as parent
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ai_documents.id", ondelete="SET NULL"), nullable=True
    )

    # Store individual AI-corrected chunks as JSONB
    corrected_chunks: Mapped[list[dict] | None] = mapped_column(JSONB, nullable=True)

    # Relationships
    task: Mapped["Task"] = relationship("Task", back_populates="ai_documents")
    parent: Mapped["AIDocument | None"] = relationship(
        "AIDocument", remote_side="AIDocument.id", foreign_keys=[parent_id]
    )


# Forward reference
from app.models.task import Task  # noqa: E402, F401
