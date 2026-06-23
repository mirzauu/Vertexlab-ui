"""
Subscription repository.
"""

from uuid import UUID
from typing import Sequence
from sqlalchemy import select, func

from app.repositories.base import BaseRepository
from app.models.subscription import Subscription, SubscriptionStatus, PlanType


class SubscriptionRepository(BaseRepository[Subscription]):
    model = Subscription

    async def get_by_org(self, org_id: UUID) -> Sequence[Subscription]:
        """Get all subscriptions for an organization."""
        result = await self.db.execute(
            select(Subscription)
            .where(Subscription.organization_id == org_id)
            .order_by(Subscription.started_at.desc())
        )
        return result.scalars().all()

    async def get_active_by_org(self, org_id: UUID) -> Sequence[Subscription]:
        """Get active subscriptions for an organization."""
        result = await self.db.execute(
            select(Subscription).where(
                Subscription.organization_id == org_id,
                Subscription.status.in_([SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL]),
            )
        )
        return result.scalars().all()

    async def count_by_status(self, org_id: UUID, status: SubscriptionStatus) -> int:
        """Count subscriptions by status for an org."""
        result = await self.db.execute(
            select(func.count(Subscription.id)).where(
                Subscription.organization_id == org_id,
                Subscription.status == status,
            )
        )
        return result.scalar_one()

    async def sum_revenue(self, org_id: UUID) -> float:
        """Sum total revenue for an organization."""
        result = await self.db.execute(
            select(func.coalesce(func.sum(Subscription.amount), 0)).where(
                Subscription.organization_id == org_id,
                Subscription.status.in_([SubscriptionStatus.ACTIVE, SubscriptionStatus.RENEWED]),
            )
        )
        return float(result.scalar_one())
