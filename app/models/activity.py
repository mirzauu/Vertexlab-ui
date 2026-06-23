"""
ActivityLog and UsageMetric ORM models.
"""

import uuid
from datetime import datetime
from sqlalchemy import String, Numeric, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, UUIDMixin


class ActivityLog(Base, UUIDMixin):
    __tablename__ = "activity_log"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    action_type: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    metadata_json: Mapped[dict] = mapped_column("metadata", JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    organization: Mapped["Organization"] = relationship("Organization", back_populates="activity_logs")
    user: Mapped["User | None"] = relationship("User", foreign_keys=[user_id])


class UsageMetric(Base, UUIDMixin):
    __tablename__ = "usage_metrics"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    metric_type: Mapped[str] = mapped_column(String(50), nullable=False)
    value: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    organization: Mapped["Organization"] = relationship("Organization", back_populates="usage_metrics")


# Forward references
from app.models.organization import Organization  # noqa: E402, F401
from app.models.user import User  # noqa: E402, F401
