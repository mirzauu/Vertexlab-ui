"""
Billing and usage response schemas.
"""

from uuid import UUID
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


class UsageRecordRead(BaseModel):
    """Usage record details."""
    id: UUID
    organization_id: UUID
    task_id: UUID
    file_id: UUID
    pages_processed: int
    cost_per_page: float
    total_cost: float
    recorded_at: datetime

    model_config = {"from_attributes": True}


class PaymentRead(BaseModel):
    """Payment transaction details."""
    id: UUID
    organization_id: UUID
    billing_summary_id: Optional[UUID] = None
    amount: float
    payment_method: str
    status: str
    transaction_id: Optional[str] = None
    paid_at: datetime

    model_config = {"from_attributes": True}


class BillingSummaryRead(BaseModel):
    """Monthly billing statement details."""
    id: UUID
    organization_id: UUID
    billing_month: str  # YYYY-MM
    total_usage_cost: float
    total_amount_due: float
    amount_paid: float
    due_balance: float
    status: str
    created_at: datetime
    updated_at: datetime
    payments: List[PaymentRead] = []

    model_config = {"from_attributes": True}


class BillingOverview(BaseModel):
    """Organization-level billing summary metrics."""
    organization_id: UUID
    total_cumulative_usage: float
    total_amount_paid: float
    outstanding_due_balance: float
    active_plan: str
    status: str


class PaymentCreate(BaseModel):
    """Simulate recording a secure payment."""
    amount: float = Field(..., gt=0)
    payment_method: str = Field(default="stripe")
    transaction_id: Optional[str] = None
