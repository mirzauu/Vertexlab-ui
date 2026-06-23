"""
Subscription ORM model.
"""

import uuid
import enum
from datetime import datetime
from sqlalchemy import String, Numeric, Enum, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, UUIDMixin


class PlanType(str, enum.Enum):
    FREE_TRIAL = "free_trial"
    PRO = "pro"
    ENTERPRISE = "enterprise"
    ANNUAL = "annual"


class SubscriptionStatus(str, enum.Enum):
    ACTIVE = "active"
    TRIAL = "trial"
    CANCELED = "canceled"
    RENEWED = "renewed"


class Subscription(Base, UUIDMixin):
    __tablename__ = "subscriptions"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    plan: Mapped[PlanType] = mapped_column(
        Enum(PlanType, name="plan_type_enum"), nullable=False
    )
    status: Mapped[SubscriptionStatus] = mapped_column(
        Enum(SubscriptionStatus, name="subscription_status_enum"), nullable=False
    )
    amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    renewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    canceled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # Relationships
    organization: Mapped["Organization"] = relationship("Organization", back_populates="subscriptions")


# Forward reference
from app.models.organization import Organization  # noqa: E402, F401
