"""
Usage, BillingSummary, and Payment ORM models.
"""

import uuid
from datetime import datetime
from sqlalchemy import String, Integer, Numeric, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, UUIDMixin


class UsageRecord(Base, UUIDMixin):
    __tablename__ = "usage_records"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False
    )
    file_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("task_files.id", ondelete="CASCADE"), nullable=False
    )
    pages_processed: Mapped[int] = mapped_column(Integer, nullable=False)
    cost_per_page: Mapped[float] = mapped_column(Numeric(10, 2), default=1.00)
    total_cost: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    organization: Mapped["Organization"] = relationship("Organization")
    task: Mapped["Task"] = relationship("Task")
    file: Mapped["TaskFile"] = relationship("TaskFile")


class BillingSummary(Base, UUIDMixin):
    __tablename__ = "billing_summaries"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    billing_month: Mapped[str] = mapped_column(String(7), nullable=False)  # Format: YYYY-MM
    total_usage_cost: Mapped[float] = mapped_column(Numeric(10, 2), default=0.00)
    total_amount_due: Mapped[float] = mapped_column(Numeric(10, 2), default=0.00)
    amount_paid: Mapped[float] = mapped_column(Numeric(10, 2), default=0.00)
    due_balance: Mapped[float] = mapped_column(Numeric(10, 2), default=0.00)
    status: Mapped[str] = mapped_column(String(20), default="unpaid")  # paid, unpaid, partially_paid
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    organization: Mapped["Organization"] = relationship("Organization")
    payments: Mapped[list["Payment"]] = relationship("Payment", back_populates="billing_summary", cascade="all, delete-orphan")


class Payment(Base, UUIDMixin):
    __tablename__ = "payments"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    billing_summary_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("billing_summaries.id", ondelete="SET NULL"), nullable=True
    )
    amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    payment_method: Mapped[str] = mapped_column(String(50), default="stripe")
    status: Mapped[str] = mapped_column(String(20), default="succeeded")  # succeeded, failed
    transaction_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    paid_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    organization: Mapped["Organization"] = relationship("Organization")
    billing_summary: Mapped["BillingSummary | None"] = relationship("BillingSummary", back_populates="payments")


# Forward references for type checking
from app.models.organization import Organization  # noqa: E402, F401
from app.models.task import Task, TaskFile  # noqa: E402, F401
