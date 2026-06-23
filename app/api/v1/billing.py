"""
Billing and usage router scoped to organizations.
"""

from uuid import UUID
from typing import List
from fastapi import APIRouter, Depends, HTTPException

from app.core.dependencies import get_current_org, get_billing_service
from app.models.organization import Organization
from app.services.billing_service import BillingService
from app.schemas.billing import (
    BillingOverview,
    UsageRecordRead,
    BillingSummaryRead,
    PaymentRead,
    PaymentCreate,
)

router = APIRouter(prefix="/organizations/{org_id}/billing", tags=["billing"])


@router.get("/overview", response_model=BillingOverview)
async def get_billing_overview(
    org_id: UUID,
    org: Organization = Depends(get_current_org),
    service: BillingService = Depends(get_billing_service),
):
    """Retrieve billing overview statistics (total usage, amount paid, due balance, and subscription plan)."""
    return await service.get_overview(org_id)


@router.get("/records", response_model=List[UsageRecordRead])
async def list_usage_records(
    org_id: UUID,
    org: Organization = Depends(get_current_org),
    service: BillingService = Depends(get_billing_service),
):
    """Retrieve a detailed list of all task-by-task page processing usage records."""
    return await service.list_records(org_id)


@router.get("/summaries", response_model=List[BillingSummaryRead])
async def list_billing_summaries(
    org_id: UUID,
    org: Organization = Depends(get_current_org),
    service: BillingService = Depends(get_billing_service),
):
    """Retrieve all monthly billing cycles summary, dues, payments, and statuses."""
    return await service.list_summaries(org_id)


@router.post("/pay/{summary_id}", response_model=PaymentRead, status_code=201)
async def pay_billing_statement(
    org_id: UUID,
    summary_id: UUID,
    payment_data: PaymentCreate,
    org: Organization = Depends(get_current_org),
    service: BillingService = Depends(get_billing_service),
):
    """Simulate a secure payment transaction against an outstanding monthly billing cycle statement."""
    return await service.record_payment(
        org_id=org_id,
        summary_id=summary_id,
        amount=payment_data.amount,
        method=payment_data.payment_method,
        transaction_id=payment_data.transaction_id,
    )
