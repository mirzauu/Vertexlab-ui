import uuid
from datetime import datetime
from sqlalchemy import String, Integer, Boolean, Text, DateTime, ForeignKey, func, cast
from sqlalchemy.dialects.postgresql import UUID, JSONB, JSONPATH
from sqlalchemy.orm import Mapped, mapped_column, relationship, column_property

from app.db.base import Base, UUIDMixin, TimestampMixin


class AIDocument(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "ai_documents"

    task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False, deferred=True)  # HTML/rich text, deferred
    version: Mapped[int] = mapped_column(Integer, default=1)
    is_draft: Mapped[bool] = mapped_column(Boolean, default=True)

    # Version chain — V2 points to V1 as parent
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ai_documents.id", ondelete="SET NULL"), nullable=True
    )

    # Store individual AI-corrected chunks as JSONB, deferred
    corrected_chunks: Mapped[list[dict] | None] = mapped_column(JSONB, nullable=True, deferred=True)

    # Column properties to calculate counts server-side without loading corrected_chunks JSON
    chunk_count: Mapped[int] = column_property(
        func.coalesce(func.jsonb_array_length(corrected_chunks), 0)
    )
    verified_count: Mapped[int] = column_property(
        func.coalesce(
            func.jsonb_array_length(
                func.jsonb_path_query_array(
                    corrected_chunks,
                    cast('$[*] ? (@.is_verified == true)', JSONPATH)
                )
            ),
            0
        )
    )

    # Relationships
    task: Mapped["Task"] = relationship("Task", back_populates="ai_documents")
    parent: Mapped["AIDocument | None"] = relationship(
        "AIDocument", remote_side="AIDocument.id", foreign_keys=[parent_id]
    )


# Forward reference
from app.models.task import Task  # noqa: E402, F401

