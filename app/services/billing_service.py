"""
Billing service: handles page usage tracking, monthly summary cycles, payments, and dashboards.
"""

import uuid
import logging
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_

from app.models.usage import UsageRecord, BillingSummary, Payment
from app.models.subscription import Subscription
from app.core.exceptions import NotFoundError, BadRequestError

logger = logging.getLogger(__name__)


class BillingService:
    """Handles usage recording, billing aggregations, payments, and query dashboard views."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def record_usage(
        self,
        org_id: uuid.UUID,
        task_id: uuid.UUID,
        file_id: uuid.UUID,
        pages: int,
        cost_per_page: float = 0.50,
    ) -> UsageRecord:
        """Record task document processing usage and upsert the monthly billing summary."""
        if pages <= 0:
            raise BadRequestError("Page count must be greater than zero")

        total_cost = pages * cost_per_page

        # Create usage record
        usage = UsageRecord(
            organization_id=org_id,
            task_id=task_id,
            file_id=file_id,
            pages_processed=pages,
            cost_per_page=cost_per_page,
            total_cost=total_cost,
        )
        self.db.add(usage)
        await self.db.flush()

        # Get current month in format YYYY-MM
        current_month = datetime.now(timezone.utc).strftime("%Y-%m")

        # Find or create BillingSummary for the organization in this month
        stmt = select(BillingSummary).where(
            and_(
                BillingSummary.organization_id == org_id,
                BillingSummary.billing_month == current_month,
            )
        )
        res = await self.db.execute(stmt)
        summary = res.scalar_one_or_none()

        if not summary:
            summary = BillingSummary(
                organization_id=org_id,
                billing_month=current_month,
                total_usage_cost=total_cost,
                total_amount_due=total_cost,
                amount_paid=0.00,
                due_balance=total_cost,
                status="unpaid",
            )
            self.db.add(summary)
        else:
            summary.total_usage_cost = float(summary.total_usage_cost) + total_cost
            summary.total_amount_due = float(summary.total_amount_due) + total_cost
            summary.due_balance = float(summary.total_amount_due) - float(summary.amount_paid)
            
            # Update status
            if summary.due_balance <= 0:
                summary.status = "paid"
            elif summary.amount_paid > 0:
                summary.status = "partially_paid"
            else:
                summary.status = "unpaid"

        await self.db.flush()
        logger.info(f"Recorded usage of {pages} pages for task {task_id}. Billing total due for {current_month}: ${summary.total_amount_due}")
        return usage

    async def get_overview(self, org_id: uuid.UUID) -> dict:
        """Get aggregate dashboard overview statistics for an organization."""
        # 1. Total cumulative usage cost
        usage_stmt = select(func.sum(UsageRecord.total_cost)).where(UsageRecord.organization_id == org_id)
        res_usage = await self.db.execute(usage_stmt)
        total_usage = res_usage.scalar() or 0.00

        # 2. Total amount paid
        pay_stmt = select(func.sum(Payment.amount)).where(
            and_(Payment.organization_id == org_id, Payment.status == "succeeded")
        )
        res_pay = await self.db.execute(pay_stmt)
        total_paid = res_pay.scalar() or 0.00

        # 3. Active subscription details
        sub_stmt = select(Subscription).where(Subscription.organization_id == org_id).limit(1)
        res_sub = await self.db.execute(sub_stmt)
        sub = res_sub.scalar_one_or_none()

        active_plan = sub.plan.value if sub else "free_trial"
        status = sub.status.value if sub else "active"

        # Calculate outstanding due balance
        due_balance = max(0.00, float(total_usage) - float(total_paid))

        return {
            "organization_id": org_id,
            "total_cumulative_usage": float(total_usage),
            "total_amount_paid": float(total_paid),
            "outstanding_due_balance": due_balance,
            "active_plan": active_plan,
            "status": status,
        }

    async def list_records(self, org_id: uuid.UUID) -> list[UsageRecord]:
        """List all detailed usage records for an organization."""
        stmt = select(UsageRecord).where(UsageRecord.organization_id == org_id).order_by(UsageRecord.recorded_at.desc())
        res = await self.db.execute(stmt)
        return list(res.scalars().all())

    async def list_summaries(self, org_id: uuid.UUID) -> list[BillingSummary]:
        """List all monthly billing statement summaries for an organization."""
        from sqlalchemy.orm import selectinload
        stmt = (
            select(BillingSummary)
            .where(BillingSummary.organization_id == org_id)
            .options(selectinload(BillingSummary.payments))
            .order_by(BillingSummary.billing_month.desc())
        )
        res = await self.db.execute(stmt)
        return list(res.scalars().all())

    async def record_payment(
        self,
        org_id: uuid.UUID,
        summary_id: uuid.UUID,
        amount: float,
        method: str = "stripe",
        transaction_id: str | None = None,
    ) -> Payment:
        """Register a payment against a monthly billing summary and update the cycle balance."""
        if amount <= 0:
            raise BadRequestError("Payment amount must be greater than zero")

        # Fetch the BillingSummary
        stmt = select(BillingSummary).where(
            and_(BillingSummary.id == summary_id, BillingSummary.organization_id == org_id)
        )
        res = await self.db.execute(stmt)
        summary = res.scalar_one_or_none()
        if not summary:
            raise NotFoundError("Billing Summary", str(summary_id))

        # Create Payment record
        payment = Payment(
            organization_id=org_id,
            billing_summary_id=summary_id,
            amount=amount,
            payment_method=method,
            status="succeeded",
            transaction_id=transaction_id or f"pay_{uuid.uuid4().hex[:12]}",
        )
        self.db.add(payment)
        await self.db.flush()

        # Update Billing Summary
        summary.amount_paid = float(summary.amount_paid) + amount
        summary.due_balance = float(summary.total_amount_due) - float(summary.amount_paid)

        if summary.due_balance <= 0.05: # Float rounding tolerance
            summary.due_balance = 0.00
            summary.status = "paid"
        elif summary.amount_paid > 0:
            summary.status = "partially_paid"
        else:
            summary.status = "unpaid"

        await self.db.flush()
        logger.info(f"Registered payment of ${amount} for org {org_id}. Remaining monthly balance due: ${summary.due_balance}")
        return payment
